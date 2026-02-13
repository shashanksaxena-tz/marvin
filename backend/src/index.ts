import express from 'express';
import cors from 'cors';
import path from 'path';
import { config, validateConfig } from './config';
import { createApiRouter } from './routes/api';
import { Orchestrator } from './services/orchestrator';
import { OrchestratorConfig } from './services/orchestrator/types';
import { registerTools } from './services/orchestrator/tools';
import { StateManager } from './services/state-manager';
import { GitSyncService } from './services/git-sync';
import { ConversationHistory } from './services/conversation-history';
import { TranscriptionService } from './services/transcription';
import { ContentFetcherService } from './services/content-fetcher';

async function main() {
  console.log('[marvin] Starting MARVIN backend...');

  // Validate environment
  validateConfig();
  console.log(`[marvin] LLM Provider: ${config.llmProvider}`);

  // ------------------------------------------------------------------
  // Initialize services
  // ------------------------------------------------------------------

  const stateManager = new StateManager(config.stateRepoPath);
  console.log(`[marvin] State Manager loaded (path: ${config.stateRepoPath})`);

  // Build orchestrator config from environment
  const orchestratorConfig: OrchestratorConfig = {
    providers: {
      groq: config.groqApiKey ? {
        apiKey: config.groqApiKey,
        model: config.groqModel,
        visionModel: config.groqVisionModel,
      } : undefined,
      gemini: config.geminiApiKey ? {
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
      } : undefined,
      cerebras: config.cerebrasApiKey ? {
        apiKey: config.cerebrasApiKey,
        model: config.cerebrasModel,
      } : undefined,
    },
    maxAgentSteps: 5,
    smartRouting: config.orchestratorMode === 'smart',
    defaultProvider: config.llmProvider,
  };

  const orchestrator = new Orchestrator(orchestratorConfig, stateManager);

  // Register tools (web search, state management, content fetching)
  const contentFetcher = new ContentFetcherService();
  registerTools(orchestrator, stateManager, contentFetcher);

  console.log(`[marvin] Orchestrator loaded (mode: ${config.orchestratorMode}, default: ${orchestrator.getDefaultProvider()}, available: ${orchestrator.getAvailableProviders().join(', ')})`);

  const gitSync = new GitSyncService({
    repoUrl: config.gitRepoUrl,
    repoPath: config.stateRepoPath,
    gitToken: config.gitToken,
  });
  console.log(`[marvin] Git Sync loaded (${gitSync.isAvailable() ? 'active' : 'disabled - no repo URL'})`);

  const conversationHistory = new ConversationHistory(config.dbPath);
  console.log('[marvin] Conversation History loaded');

  const transcriptionService = new TranscriptionService();
  console.log(`[marvin] Transcription Service loaded (${transcriptionService.isAvailable() ? 'active' : 'disabled - no GROQ_API_KEY'})`);

  console.log('[marvin] Content Fetcher loaded');

  // Pull latest state from git on startup
  if (gitSync.isAvailable()) {
    try {
      await gitSync.initialize();
      console.log('[marvin] Git sync initialized');
    } catch (err) {
      console.warn('[marvin] Git sync init failed:', err);
    }
  }

  // ------------------------------------------------------------------
  // Express app setup
  // ------------------------------------------------------------------
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Mount API routes - wrap services to match route expectations
  const deps = {
    claudeProcessor: {
      async process(text: string, context?: Record<string, unknown>) {
        // Extract image data if present (from Telegram photo handler)
        let imageBase64: string | undefined;
        let imageMimeType: string | undefined;
        if (context?.images && Array.isArray(context.images) && context.images.length > 0) {
          const img = context.images[0] as { base64?: string; mediaType?: string };
          imageBase64 = img.base64;
          imageMimeType = img.mediaType;
        }

        const result = await orchestrator.processMessage({
          text,
          contentContext: {
            ...context as any,
            imageBase64,
            imageMimeType,
          },
        });
        // Apply state changes
        for (const change of result.stateChanges) {
          try {
            switch (change.type) {
              case 'add_todo':
                await stateManager.addTodo(change.data.text, change.data.context || '');
                break;
              case 'update_goal':
                await stateManager.updateGoal(change.data.goal, change.data.status, change.data.notes || '');
                break;
              case 'add_capture':
                await stateManager.addToInbox({
                  content: change.data.text,
                  label: 'capture',
                  connectedTo: change.data.tags?.join(', ') || '',
                });
                break;
            }
          } catch (e) {
            console.error('[marvin] Failed to apply state change:', change, e);
          }
        }
        return {
          response: result.response,
          classification: result.classification,
          provider: result.provider,
        };
      },
      getDefaultProvider: () => orchestrator.getDefaultProvider(),
      getAvailableProviders: () => orchestrator.getAvailableProviders(),
    },
    stateManager: {
      async getPriorities() {
        const state = await stateManager.getCurrentState();
        return state.priorities || [];
      },
      async getTodos() {
        return stateManager.getTodos();
      },
      async getGoals() {
        return stateManager.getGoals();
      },
      hasChanged() {
        return stateManager.hasChanged();
      },
    },
    gitSync: {
      async pull() { if (gitSync.isAvailable()) await gitSync.pull(); },
      async sync() { if (gitSync.isAvailable()) await gitSync.syncAfterChange('Auto-sync from MARVIN backend'); },
    },
    transcriptionService,
    contentFetcher,
    conversationHistory: {
      async save(entry: { role: string; content: string; source: string; classification?: string }) {
        conversationHistory.addMessage({
          source: entry.source,
          inputType: entry.role === 'user' ? 'text' : 'response',
          inputText: entry.content,
          classification: entry.classification,
          response: entry.role === 'assistant' ? entry.content : undefined,
        });
      },
      async query(params: { limit?: number; offset?: number; type?: string; search?: string }) {
        if (params.search) {
          const results = conversationHistory.search(params.search, params.limit || 50);
          return { messages: results, total: results.length };
        }
        const results = conversationHistory.getHistory({
          limit: params.limit,
          offset: params.offset,
          type: params.type,
        });
        return { messages: results, total: results.length };
      },
    },
  };

  app.use('/', createApiRouter(deps as any));

  // Mount Telegram bot (polling mode for local dev, webhook for production)
  try {
    const telegramMod = await import('./telegram/bot');
    if (typeof telegramMod.mountTelegramWebhook === 'function') {
      telegramMod.mountTelegramWebhook(app, deps as any);
      console.log('[marvin] Telegram bot mounted');
    }
  } catch (err) {
    console.warn('[marvin] Telegram bot module not available:', err);
  }

  // ------------------------------------------------------------------
  // Start server
  // ------------------------------------------------------------------
  const server = app.listen(config.port, () => {
    console.log(`[marvin] Server listening on port ${config.port}`);
    console.log(`[marvin] Environment: ${config.nodeEnv}`);
    console.log(`[marvin] Health check: http://localhost:${config.port}/health`);
  });

  // ------------------------------------------------------------------
  // Graceful shutdown
  // ------------------------------------------------------------------
  const shutdown = async (signal: string) => {
    console.log(`\n[marvin] Received ${signal}, shutting down gracefully...`);

    if (gitSync.isAvailable() && stateManager.hasChanged()) {
      try {
        await gitSync.syncAfterChange('Final sync on shutdown');
        console.log('[marvin] Final git sync complete');
      } catch (err) {
        console.warn('[marvin] Final git sync failed:', err);
      }
    }

    conversationHistory.close();

    server.close(() => {
      console.log('[marvin] Server closed');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[marvin] Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[marvin] Fatal startup error:', err);
  process.exit(1);
});
