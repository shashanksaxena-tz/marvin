import { Bot, Context, webhookCallback } from 'grammy';
import type { Express } from 'express';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Service interfaces - aligned with IClaudeProcessor, IStateManager,
// IConversationHistory, ITranscriptionService, IContentFetcher from types.ts
// ---------------------------------------------------------------------------

interface BotClaudeProcessor {
  process(text: string, context?: Record<string, unknown>): Promise<{
    response: string;
    classification: string;
  }>;
}

interface BotTranscriptionService {
  isAvailable(): boolean;
  transcribe(audioBuffer: Buffer, filename?: string): Promise<{ text: string }>;
}

interface BotContentFetcher {
  fetch(url: string): Promise<{
    title: string;
    description: string;
    mainText: string;
    url: string;
  }>;
}

interface BotConversationHistory {
  save(entry: {
    role: 'user' | 'assistant';
    content: string;
    source: string;
    classification?: string;
  }): Promise<void>;
}

interface BotStateManager {
  getPriorities(): Promise<string[]>;
  getTodos(): Promise<string[]>;
  getGoals(): Promise<{ work: string[]; personal: string[] }>;
}

interface BotServices {
  claudeProcessor: BotClaudeProcessor;
  transcriptionService: BotTranscriptionService;
  contentFetcher: BotContentFetcher;
  conversationHistory: BotConversationHistory;
  stateManager: BotStateManager;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
const TELEGRAM_MAX_LENGTH = 4096;

/**
 * Escape special characters for Telegram MarkdownV2 parse mode.
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Split a long message into chunks that fit within Telegram's 4096 char limit.
 * Splits at newline boundaries when possible.
 */
function splitMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf('\n', TELEGRAM_MAX_LENGTH);
    if (splitAt <= 0 || splitAt < TELEGRAM_MAX_LENGTH / 2) {
      splitAt = remaining.lastIndexOf(' ', TELEGRAM_MAX_LENGTH);
    }
    if (splitAt <= 0) {
      splitAt = TELEGRAM_MAX_LENGTH;
    }

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }

  return chunks;
}

/**
 * Format a string array as a readable list.
 */
function formatList(items: string[], emptyMsg = 'None'): string {
  if (items.length === 0) return emptyMsg;
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

// ---------------------------------------------------------------------------
// TelegramBot
// ---------------------------------------------------------------------------

export class TelegramBot {
  private readonly bot: Bot;
  private readonly services: BotServices;
  private readonly captureMode = new Set<number>();

  constructor(services: BotServices) {
    this.services = services;
    this.bot = new Bot(config.telegramBotToken);
    this.registerHandlers();
  }

  /**
   * Returns Express-compatible middleware for the Telegram webhook.
   */
  getWebhookCallback() {
    return webhookCallback(this.bot, 'express');
  }

  /**
   * Register the webhook URL with Telegram servers.
   */
  async setupWebhook(url: string): Promise<void> {
    await this.bot.api.setWebhook(url);
    console.log(`[telegram] Webhook registered: ${url}`);
  }

  /**
   * Start long-polling mode (for local development without a public URL).
   */
  async startPolling(): Promise<void> {
    // Delete any existing webhook first so polling works
    await this.bot.api.deleteWebhook();
    this.bot.start({
      onStart: () => console.log('[telegram] Bot started in polling mode'),
    });
  }

  /**
   * Stop the bot gracefully.
   */
  stop(): void {
    this.bot.stop();
  }

  // -------------------------------------------------------------------------
  // Handler registration
  // -------------------------------------------------------------------------

  private registerHandlers(): void {
    this.bot.command('status', (ctx) => this.handleStatus(ctx));
    this.bot.command('todos', (ctx) => this.handleTodos(ctx));
    this.bot.command('goals', (ctx) => this.handleGoals(ctx));
    this.bot.command('capture', (ctx) => this.handleCapture(ctx));
    this.bot.command('provider', (ctx) => this.handleProvider(ctx));

    this.bot.on('message:voice', (ctx) => this.handleVoice(ctx));
    this.bot.on('message:photo', (ctx) => this.handlePhoto(ctx));
    this.bot.on('message:text', (ctx) => this.handleText(ctx));
  }

  // -------------------------------------------------------------------------
  // /status
  // -------------------------------------------------------------------------

  private async handleStatus(ctx: Context): Promise<void> {
    try {
      const [priorities, todos] = await Promise.all([
        this.services.stateManager.getPriorities(),
        this.services.stateManager.getTodos(),
      ]);

      const msg =
        `*Priorities*\n${formatList(priorities, 'No priorities set')}\n\n` +
        `*Todos*\n${formatList(todos, 'No todos')}`;
      await this.reply(ctx, msg);
    } catch (err) {
      console.error('[telegram] /status error:', err);
      await this.reply(ctx, 'Failed to fetch status. Try again later.');
    }
  }

  // -------------------------------------------------------------------------
  // /todos
  // -------------------------------------------------------------------------

  private async handleTodos(ctx: Context): Promise<void> {
    try {
      const todos = await this.services.stateManager.getTodos();
      await this.reply(ctx, `*Todos*\n\n${formatList(todos, 'No todos')}`);
    } catch (err) {
      console.error('[telegram] /todos error:', err);
      await this.reply(ctx, 'Failed to fetch todos.');
    }
  }

  // -------------------------------------------------------------------------
  // /goals
  // -------------------------------------------------------------------------

  private async handleGoals(ctx: Context): Promise<void> {
    try {
      const goals = await this.services.stateManager.getGoals();
      const msg =
        `*Work Goals*\n${formatList(goals.work, 'None')}\n\n` +
        `*Personal Goals*\n${formatList(goals.personal, 'None')}`;
      await this.reply(ctx, msg);
    } catch (err) {
      console.error('[telegram] /goals error:', err);
      await this.reply(ctx, 'Failed to fetch goals.');
    }
  }

  // -------------------------------------------------------------------------
  // /capture
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // /provider - Switch or view LLM provider
  // -------------------------------------------------------------------------

  private async handleProvider(ctx: Context): Promise<void> {
    try {
      const text = ctx.message?.text?.trim() || '';
      const parts = text.split(/\s+/);
      const arg = parts[1]?.toLowerCase();

      const processor = this.services.claudeProcessor as any;
      const current = processor.getDefaultProvider?.() || config.llmProvider;
      const available = processor.getAvailableProviders?.() || [];

      if (!arg || arg === 'status') {
        await this.reply(
          ctx,
          `Current LLM: ${current}\nAvailable: ${available.join(', ') || 'none'}\n\nUse /provider groq or /provider anthropic to switch.`
        );
        return;
      }

      if (arg !== 'groq' && arg !== 'anthropic') {
        await this.reply(ctx, 'Usage: /provider [groq|anthropic]');
        return;
      }

      if (!available.includes(arg)) {
        await this.reply(ctx, `Provider "${arg}" not available. Missing API key.`);
        return;
      }

      (config as any).llmProvider = arg;
      await this.reply(ctx, `Switched to ${arg}. ${arg === 'groq' ? '(cost-effective mode)' : '(powerful mode)'}`);
    } catch (err) {
      await this.reply(ctx, 'Failed to switch provider.');
    }
  }

  // -------------------------------------------------------------------------
  // /capture
  // -------------------------------------------------------------------------

  private async handleCapture(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    this.captureMode.add(chatId);
    await this.reply(ctx, 'Capture mode on. Send your next message and it will be saved directly.');
  }

  // -------------------------------------------------------------------------
  // Voice messages
  // -------------------------------------------------------------------------

  private async handleVoice(ctx: Context): Promise<void> {
    const voice = ctx.message?.voice;
    if (!voice) return;

    if (!this.services.transcriptionService.isAvailable()) {
      await this.reply(ctx, 'Voice transcription is not configured (missing GROQ_API_KEY).');
      return;
    }

    try {
      const file = await ctx.api.getFile(voice.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const audioBuffer = Buffer.from(await response.arrayBuffer());

      const transcription = await this.services.transcriptionService.transcribe(
        audioBuffer,
        file.file_path || 'voice.ogg',
      );

      if (!transcription.text) {
        await this.reply(ctx, 'Could not transcribe the voice message (empty result).');
        return;
      }

      await this.services.conversationHistory.save({
        role: 'user',
        content: `[Voice] ${transcription.text}`,
        source: 'telegram',
      });

      const result = await this.services.claudeProcessor.process(transcription.text, {
        source: 'telegram-voice',
      });

      await this.services.conversationHistory.save({
        role: 'assistant',
        content: result.response,
        source: 'telegram',
        classification: result.classification,
      });

      await this.reply(ctx, result.response);
    } catch (err) {
      console.error('[telegram] voice handling error:', err);
      await this.reply(ctx, 'Failed to process voice message.');
    }
  }

  // -------------------------------------------------------------------------
  // Photo messages
  // -------------------------------------------------------------------------

  private async handlePhoto(ctx: Context): Promise<void> {
    const photos = ctx.message?.photo;
    if (!photos || photos.length === 0) return;

    try {
      const photo = photos[photos.length - 1];
      const file = await ctx.api.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      const base64 = imageBuffer.toString('base64');

      const ext = file.file_path?.split('.').pop()?.toLowerCase() || 'jpg';
      const mediaType = ext === 'png' ? 'image/png' : 'image/jpeg';

      const caption = ctx.message?.caption || 'What is in this image?';

      await this.services.conversationHistory.save({
        role: 'user',
        content: `[Photo] ${caption}`,
        source: 'telegram',
      });

      const result = await this.services.claudeProcessor.process(caption, {
        source: 'telegram-photo',
        images: [{ base64, mediaType }],
      });

      await this.services.conversationHistory.save({
        role: 'assistant',
        content: result.response,
        source: 'telegram',
        classification: result.classification,
      });

      await this.reply(ctx, result.response);
    } catch (err) {
      console.error('[telegram] photo handling error:', err);
      await this.reply(ctx, 'Failed to process photo.');
    }
  }

  // -------------------------------------------------------------------------
  // Text messages (also handles forwarded messages and URLs)
  // -------------------------------------------------------------------------

  private async handleText(ctx: Context): Promise<void> {
    const text = ctx.message?.text;
    if (!text) return;

    const chatId = ctx.chat?.id;
    const isCapture = chatId ? this.captureMode.has(chatId) : false;
    if (isCapture && chatId) {
      this.captureMode.delete(chatId);
    }

    try {
      const contextObj: Record<string, unknown> = { source: 'telegram' };

      // Handle forwarded messages
      if (ctx.message?.forward_origin) {
        contextObj.forwarded = true;
      }

      // Detect and fetch URLs
      const urls = text.match(URL_REGEX);
      if (urls && urls.length > 0) {
        const fetched = await Promise.allSettled(
          urls.slice(0, 3).map((url) => this.services.contentFetcher.fetch(url)),
        );

        const contents: Array<{ title: string; url: string; description: string; text: string }> = [];
        for (const result of fetched) {
          if (result.status === 'fulfilled') {
            const c = result.value;
            contents.push({
              title: c.title,
              url: c.url,
              description: c.description,
              text: c.mainText.substring(0, 1000),
            });
          }
        }

        if (contents.length > 0) {
          contextObj.fetchedUrls = contents;
        }
      }

      if (isCapture) {
        contextObj.captureMode = true;
      }

      await this.services.conversationHistory.save({
        role: 'user',
        content: text,
        source: 'telegram',
      });

      const result = await this.services.claudeProcessor.process(text, contextObj);

      await this.services.conversationHistory.save({
        role: 'assistant',
        content: result.response,
        source: 'telegram',
        classification: result.classification,
      });

      await this.reply(ctx, result.response);
    } catch (err) {
      console.error('[telegram] text handling error:', err);
      await this.reply(ctx, 'Something went wrong processing your message.');
    }
  }

  // -------------------------------------------------------------------------
  // Reply helper
  // -------------------------------------------------------------------------

  private async reply(ctx: Context, text: string): Promise<void> {
    const chunks = splitMessage(text);

    for (const chunk of chunks) {
      try {
        await ctx.reply(escapeMarkdownV2(chunk), {
          parse_mode: 'MarkdownV2',
          reply_parameters: ctx.message
            ? { message_id: ctx.message.message_id }
            : undefined,
        });
      } catch {
        await ctx.reply(chunk, {
          reply_parameters: ctx.message
            ? { message_id: ctx.message.message_id }
            : undefined,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// mountTelegramWebhook - called from index.ts
// ---------------------------------------------------------------------------

/**
 * Mount the Telegram webhook on the Express app.
 * Called by index.ts when the telegram bot module is loaded.
 */
export function mountTelegramWebhook(
  app: Express,
  deps: {
    claudeProcessor: BotClaudeProcessor;
    stateManager: BotStateManager;
    transcriptionService: BotTranscriptionService;
    contentFetcher: BotContentFetcher;
    conversationHistory: BotConversationHistory;
  },
): void {
  if (!config.telegramBotToken) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN not set, skipping bot setup');
    return;
  }

  const bot = new TelegramBot({
    claudeProcessor: deps.claudeProcessor,
    transcriptionService: deps.transcriptionService,
    contentFetcher: deps.contentFetcher,
    conversationHistory: deps.conversationHistory,
    stateManager: deps.stateManager,
  });

  if (config.telegramWebhookUrl) {
    // Production: use webhook mode
    app.post('/telegram/webhook', bot.getWebhookCallback());
    const webhookUrl = `${config.telegramWebhookUrl}/telegram/webhook`;
    bot.setupWebhook(webhookUrl).catch((err) => {
      console.error('[telegram] Failed to register webhook:', err);
    });
    console.log('[telegram] Bot initialized in webhook mode');
  } else {
    // Local dev: use long-polling mode (don't mount webhook route)
    bot.startPolling().catch((err) => {
      console.error('[telegram] Failed to start polling:', err);
    });
    console.log('[telegram] Bot initialized in polling mode (local dev)');
  }
}
