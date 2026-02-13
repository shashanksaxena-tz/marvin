import { Router, Request, Response } from 'express';
import multer from 'multer';
import type {
  MessageRequest,
  MessageResponse,
  VoiceResponse,
  ShareRequest,
  ShareResponse,
  StatusResponse,
  HistoryQuery,
  HistoryResponse,
  HealthResponse,
} from '../types';

/**
 * Dependencies injected into the API router.
 * Uses loose typing since index.ts wraps real services with adapter functions.
 */
export interface ApiDependencies {
  claudeProcessor: {
    process(text: string, context?: Record<string, unknown>): Promise<{ response: string; classification: string; provider?: string }>;
    getDefaultProvider?(): string;
    getAvailableProviders?(): string[];
  };
  stateManager: {
    getPriorities(): Promise<string[]>;
    getTodos(): Promise<any>;
    getGoals(): Promise<any>;
    hasChanged(): boolean;
  };
  gitSync: {
    pull(): Promise<void>;
    sync(): Promise<void>;
  };
  transcriptionService: {
    isAvailable(): boolean;
    transcribe(audioBuffer: Buffer, filename?: string): Promise<{ text: string }>;
  };
  contentFetcher: {
    fetch(url: string): Promise<any>;
  };
  conversationHistory: {
    save(entry: { role: string; content: string; source: string; classification?: string }): Promise<void>;
    query(params: { limit?: number; offset?: number; type?: string; search?: string }): Promise<{ messages: any[]; total: number }>;
  };
}

/**
 * Create the main API router with all endpoints.
 */
export function createApiRouter(deps: ApiDependencies): Router {
  const router = Router();

  // Multer for audio file uploads (memory storage, 25MB limit)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  const startTime = Date.now();

  // -------------------------------------------------------
  // POST /api/message - Text message from Android app
  // -------------------------------------------------------
  router.post('/api/message', async (req: Request, res: Response) => {
    try {
      const { text, source } = req.body as MessageRequest;

      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Missing required field: text' });
        return;
      }

      const result = await deps.claudeProcessor.process(text);

      // Save user message and assistant response
      await deps.conversationHistory.save({
        role: 'user',
        content: text,
        source: source || 'android',
        classification: result.classification,
      });
      await deps.conversationHistory.save({
        role: 'assistant',
        content: result.response,
        source: source || 'android',
        classification: result.classification,
      });

      // Trigger git sync if state changed
      if (deps.stateManager.hasChanged()) {
        deps.gitSync.sync().catch((err: any) =>
          console.error('[api] Git sync failed:', err)
        );
      }

      const response: MessageResponse = {
        response: result.response,
        classification: result.classification,
      };
      res.json(response);
    } catch (error) {
      console.error('[api] POST /api/message error:', error);
      res.status(500).json({
        error: 'Failed to process message',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // -------------------------------------------------------
  // POST /api/voice - Audio upload from Android app
  // -------------------------------------------------------
  router.post('/api/voice', upload.single('audio'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No audio file provided' });
        return;
      }

      if (!deps.transcriptionService.isAvailable()) {
        res.status(503).json({ error: 'Transcription service not available. GROQ_API_KEY may be missing.' });
        return;
      }

      const transcriptionResult = await deps.transcriptionService.transcribe(
        req.file.buffer,
        req.file.originalname
      );

      const result = await deps.claudeProcessor.process(transcriptionResult.text);

      // Save conversation
      await deps.conversationHistory.save({
        role: 'user',
        content: transcriptionResult.text,
        source: 'voice',
        classification: result.classification,
      });
      await deps.conversationHistory.save({
        role: 'assistant',
        content: result.response,
        source: 'voice',
        classification: result.classification,
      });

      if (deps.stateManager.hasChanged()) {
        deps.gitSync.sync().catch((err: any) =>
          console.error('[api] Git sync failed:', err)
        );
      }

      const response: VoiceResponse = {
        response: result.response,
        classification: result.classification,
        transcription: transcriptionResult.text,
      };
      res.json(response);
    } catch (error) {
      console.error('[api] POST /api/voice error:', error);
      res.status(500).json({
        error: 'Failed to process voice message',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // -------------------------------------------------------
  // POST /api/share - Shared content from Android share sheet
  // -------------------------------------------------------
  router.post('/api/share', async (req: Request, res: Response) => {
    try {
      const { url, text, image, context } = req.body as ShareRequest;

      if (!url && !text && !image) {
        res.status(400).json({ error: 'At least one of url, text, or image is required' });
        return;
      }

      let contentContext: Record<string, unknown> = {};

      // If URL provided, fetch its content
      if (url) {
        try {
          const fetched = await deps.contentFetcher.fetch(url);
          contentContext = {
            fetchedContent: fetched,
            sharedUrl: url,
          };
        } catch (fetchErr) {
          console.warn('[api] Content fetch failed for URL:', url, fetchErr);
          contentContext = { sharedUrl: url, fetchError: true };
        }
      }

      if (image) {
        contentContext.sharedImage = image;
      }
      if (context) {
        contentContext.userContext = context;
      }

      const inputText = text || url || 'Shared content (image)';
      const result = await deps.claudeProcessor.process(inputText, contentContext);

      // Save conversation
      await deps.conversationHistory.save({
        role: 'user',
        content: inputText,
        source: 'share',
        classification: result.classification,
      });
      await deps.conversationHistory.save({
        role: 'assistant',
        content: result.response,
        source: 'share',
        classification: result.classification,
      });

      if (deps.stateManager.hasChanged()) {
        deps.gitSync.sync().catch((err: any) =>
          console.error('[api] Git sync failed:', err)
        );
      }

      const response: ShareResponse = {
        response: result.response,
        summary: contentContext.fetchedContent
          ? (contentContext.fetchedContent as { description?: string }).description
          : undefined,
        connections: [],
      };
      res.json(response);
    } catch (error) {
      console.error('[api] POST /api/share error:', error);
      res.status(500).json({
        error: 'Failed to process shared content',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // -------------------------------------------------------
  // GET /api/status - Current MARVIN status
  // -------------------------------------------------------
  router.get('/api/status', async (_req: Request, res: Response) => {
    try {
      const [priorities, todos, goals] = await Promise.all([
        deps.stateManager.getPriorities(),
        deps.stateManager.getTodos(),
        deps.stateManager.getGoals(),
      ]);

      const response: StatusResponse = { priorities, todos, goals };
      res.json(response);
    } catch (error) {
      console.error('[api] GET /api/status error:', error);
      res.status(500).json({
        error: 'Failed to get status',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // -------------------------------------------------------
  // GET /api/history - Past conversations
  // -------------------------------------------------------
  router.get('/api/history', async (req: Request, res: Response) => {
    try {
      const query: HistoryQuery = {
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
        type: req.query.type as string | undefined,
        search: req.query.search as string | undefined,
      };

      const result = await deps.conversationHistory.query(query);

      const response: HistoryResponse = {
        messages: result.messages,
        total: result.total,
      };
      res.json(response);
    } catch (error) {
      console.error('[api] GET /api/history error:', error);
      res.status(500).json({
        error: 'Failed to get conversation history',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // -------------------------------------------------------
  // GET /api/provider - Get current LLM provider info
  // -------------------------------------------------------
  router.get('/api/provider', (_req: Request, res: Response) => {
    const processor = deps.claudeProcessor as any;
    res.json({
      current: processor.getDefaultProvider?.() || 'unknown',
      available: processor.getAvailableProviders?.() || [],
    });
  });

  // -------------------------------------------------------
  // POST /api/provider - Switch LLM provider
  // -------------------------------------------------------
  router.post('/api/provider', (req: Request, res: Response) => {
    const { provider } = req.body;
    if (provider !== 'groq' && provider !== 'anthropic') {
      res.status(400).json({ error: 'Provider must be "groq" or "anthropic"' });
      return;
    }
    const available = (deps.claudeProcessor as any).getAvailableProviders?.() || [];
    if (!available.includes(provider)) {
      res.status(400).json({ error: `Provider "${provider}" not available. Missing API key.` });
      return;
    }
    // Update the config at runtime
    (require('../config').config as any).llmProvider = provider;
    res.json({ provider, message: `Switched to ${provider}` });
  });

  // -------------------------------------------------------
  // GET /health - Health check
  // -------------------------------------------------------
  router.get('/health', (_req: Request, res: Response) => {
    const response: HealthResponse = {
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      llmProvider: (require('../config').config as any).llmProvider || 'unknown',
    };
    res.json(response);
  });

  return router;
}
