import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  /** Server configuration */
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  /** LLM Provider: 'groq' (default) - used as default in single mode */
  llmProvider: (process.env.LLM_PROVIDER || 'groq') as 'groq' | 'anthropic' | 'gemini' | 'cerebras',

  /** Anthropic / Claude */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',

  /** Groq (Whisper transcription + LLM) */
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  groqVisionModel: process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',

  /** Google Gemini (complex reasoning, web search, vision) */
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  /** Cerebras (ultra-fast fallback) */
  cerebrasApiKey: process.env.CEREBRAS_API_KEY || '',
  cerebrasModel: process.env.CEREBRAS_MODEL || 'qwen-3-235b',

  /** Orchestrator mode: 'smart' (auto-route) | 'single' (use llmProvider only) */
  orchestratorMode: (process.env.ORCHESTRATOR_MODE || 'smart') as 'smart' | 'single',

  /** Telegram */
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramWebhookUrl: process.env.TELEGRAM_WEBHOOK_URL || '',

  /** Git sync */
  gitRepoUrl: process.env.GIT_REPO_URL || '',
  gitToken: process.env.GIT_TOKEN || '',

  /** State files */
  stateRepoPath: path.resolve(process.env.STATE_REPO_PATH || './marvin-state'),

  /** Database */
  dbPath: process.env.DB_PATH || './data/marvin.db',
} as const;

/**
 * Validate that all required environment variables are set.
 * Logs warnings for missing optional vars, throws for critical ones.
 */
export function validateConfig(): void {
  // Check which LLM providers are available
  const providers: Array<{ name: string; key: string }> = [
    { name: 'groq', key: config.groqApiKey },
    { name: 'anthropic', key: config.anthropicApiKey },
    { name: 'gemini', key: config.geminiApiKey },
    { name: 'cerebras', key: config.cerebrasApiKey },
  ];

  const available = providers.filter(p => !!p.key).map(p => p.name);
  const unavailable = providers.filter(p => !p.key).map(p => p.name);

  // Log available providers on startup
  if (available.length > 0) {
    console.log(`[config] Available LLM providers: ${available.join(', ')}`);
  }

  // At least one LLM provider must be configured
  if (available.length === 0) {
    throw new Error(
      'At least one LLM provider must be configured. Set one of: GROQ_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, CEREBRAS_API_KEY'
    );
  }

  // Smart mode warning: works best with multiple providers
  if (config.orchestratorMode === 'smart' && available.length === 1) {
    console.warn(
      `[config] ORCHESTRATOR_MODE=smart but only ${available[0]} is configured. Smart routing works best with multiple providers.`
    );
  }

  // Validate selected provider has its key (single mode fallback)
  const selectedHasKey = available.includes(config.llmProvider);
  if (!selectedHasKey) {
    const fallback = available[0];
    console.warn(`[config] LLM_PROVIDER=${config.llmProvider} but its API key is not set, falling back to ${fallback}`);
    (config as any).llmProvider = fallback;
  }

  const optional: Array<[string, string]> = [
    ['TELEGRAM_BOT_TOKEN', config.telegramBotToken],
    ['GIT_REPO_URL', config.gitRepoUrl],
  ];

  const missingOptional = optional.filter(([, value]) => !value);
  if (missingOptional.length > 0) {
    console.warn(
      `[config] Missing optional env vars (some features disabled): ${missingOptional.map(([name]) => name).join(', ')}`
    );
  }

  if (unavailable.length > 0) {
    console.warn(
      `[config] Unconfigured LLM providers: ${unavailable.join(', ')}`
    );
  }
}
