# Multi-LLM Orchestrator Architecture

## Overview

The orchestrator replaces the current `ClaudeProcessor` with a smart routing layer that classifies incoming messages and routes them to the best available free-tier LLM provider. It preserves backward compatibility -- if only `GROQ_API_KEY` is set, it behaves like the current system.

---

## Providers (3 Free Tiers)

| Provider | Models | Strengths | Free Tier Limits |
|----------|--------|-----------|-----------------|
| **Groq** | Llama 3.3 70B, Llama 4 Scout (vision) | Fastest inference, vision, Whisper transcription | 30 RPM / 14.4K tokens/min |
| **Gemini** | Gemini 2.0 Flash | Grounded web search, vision, long context, tool calling | 15 RPM / 1M tokens/min |
| **Cerebras** | Qwen 3 235B | Ultra-fast inference fallback | 30 RPM / 60K tokens/min |

---

## File Structure

```
backend/src/
  config.ts                          # UPDATE: add Gemini + Cerebras API keys
  services/
    claude-processor.ts              # KEEP: renamed export alias for backward compat
    orchestrator/
      index.ts                       # Orchestrator class (main entry point)
      types.ts                       # All shared interfaces and types
      classifier.ts                  # Message classification logic
      rate-limiter.ts                # Per-provider rate limit tracking
      providers/
        base.ts                      # Abstract LLMProvider base class
        groq.ts                      # Groq provider (Llama 3.3 + vision)
        gemini.ts                    # Gemini provider (Flash + grounding)
        cerebras.ts                  # Cerebras provider (fast fallback)
        registry.ts                  # Provider registry (init + lookup)
      tools/
        index.ts                     # Tool registry and definitions
        web-search.ts                # Web search via Gemini grounding
        state-tools.ts               # Read/write MARVIN state
        content-fetch.ts             # Fetch URL content
  index.ts                           # UPDATE: swap ClaudeProcessor for Orchestrator
  telegram/bot.ts                    # NO CHANGES (uses same process() interface)
  routes/api.ts                      # MINIMAL CHANGES (provider list expands)
```

---

## TypeScript Interfaces

### Core Types (`orchestrator/types.ts`)

```typescript
// ---------------------------------------------------------------------------
// Message Classification
// ---------------------------------------------------------------------------

/**
 * Categories the classifier assigns to each incoming message.
 * Determines which provider handles the request.
 */
export type MessageCategory =
  | 'simple_chat'        // casual conversation, greetings, quick answers
  | 'complex_reasoning'  // analysis, planning, multi-step thinking
  | 'web_search'         // needs current info, URLs, news, weather
  | 'vision'             // image analysis (photo sent with message)
  | 'code_task'          // code generation, debugging, technical
  | 'state_update';      // MARVIN state changes (todos, goals, captures)

/**
 * The result of classifying a message before routing.
 */
export interface ClassificationResult {
  category: MessageCategory;
  confidence: number;       // 0-1, used to decide if fallback is needed
  reasoning?: string;       // optional debug info
  requiresTools: boolean;   // whether this needs an agent loop
  hasImage: boolean;        // whether the input contains an image
}

// ---------------------------------------------------------------------------
// Provider Interface
// ---------------------------------------------------------------------------

/**
 * Common interface that every LLM provider must implement.
 */
export interface LLMProvider {
  /** Unique identifier for this provider (e.g., 'groq', 'gemini') */
  readonly name: string;

  /** Human-readable display name */
  readonly displayName: string;

  /** Whether this provider is configured (API key present) */
  readonly isAvailable: boolean;

  /** What capabilities this provider supports */
  readonly capabilities: ProviderCapabilities;

  /**
   * Send a chat completion request.
   * Returns the raw text response from the model.
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Send a chat request that supports tool/function calling.
   * Only providers with capabilities.toolUse = true need a real implementation.
   * Others should throw an UnsupportedError.
   */
  chatWithTools(request: ToolChatRequest): Promise<ToolChatResponse>;
}

export interface ProviderCapabilities {
  chat: boolean;
  vision: boolean;
  toolUse: boolean;          // native function calling
  jsonMode: boolean;         // can force JSON output
  webSearch: boolean;        // built-in web search (Gemini grounding)
  maxContextTokens: number;  // approximate context window
  maxOutputTokens: number;   // max response tokens
}

// ---------------------------------------------------------------------------
// Chat Request / Response
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  toolCallId?: string;       // for role='tool' responses
  name?: string;             // tool name for role='tool'
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };  // base64

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;       // default 0.7
  maxTokens?: number;         // default 1024
  jsonMode?: boolean;         // request JSON output
  model?: string;             // override default model
}

export interface ChatResponse {
  content: string;
  model: string;              // actual model used
  provider: string;           // provider name
  usage?: TokenUsage;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// Tool Calling
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;  // JSON Schema
}

export interface ToolChatRequest extends ChatRequest {
  tools: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { name: string };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolChatResponse extends ChatResponse {
  toolCalls?: ToolCall[];
}

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

export interface RateLimitState {
  provider: string;
  requestsRemaining: number;
  tokensRemaining: number;
  resetsAt: number;           // Unix timestamp ms
  isLimited: boolean;
  consecutiveErrors: number;
  lastError?: string;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
  /** How long to back off after hitting a limit (ms) */
  backoffMs: number;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/**
 * A routing decision: which provider to use and why.
 */
export interface RoutingDecision {
  provider: string;           // provider name
  category: MessageCategory;
  fallbackChain: string[];    // ordered list of fallbacks if primary fails
  reason: string;             // human-readable explanation
}

// ---------------------------------------------------------------------------
// Orchestrator Config
// ---------------------------------------------------------------------------

export interface OrchestratorConfig {
  /** Provider-specific API keys (3 providers: Groq, Gemini, Cerebras) */
  providers: {
    groq?: { apiKey: string; model?: string; visionModel?: string };
    gemini?: { apiKey: string; model?: string };
    cerebras?: { apiKey: string; model?: string };
  };

  /** Maximum agent loop iterations for tool-using tasks */
  maxAgentSteps: number;  // default: 5

  /** Whether to use the lightweight classifier or always use the default provider */
  smartRouting: boolean;  // default: true

  /** Default provider when smart routing is disabled */
  defaultProvider: string;  // default: 'groq'

  /** Rate limit configs per provider (defaults built-in) */
  rateLimits?: Partial<Record<string, RateLimitConfig>>;
}

// ---------------------------------------------------------------------------
// Orchestrator Input/Output (backward compatible with ClaudeProcessor)
// ---------------------------------------------------------------------------

/**
 * Input to the orchestrator. Superset of the existing ProcessorInput.
 */
export interface OrchestratorInput {
  text: string;
  contentContext?: {
    url?: string;
    title?: string;
    summary?: string;
    imageBase64?: string;
    imageMimeType?: string;
    fetchedUrls?: any[];
    [key: string]: any;
  };
  /** Force a specific provider (skips classification) */
  provider?: string;
  /** Force a specific category (skips classification) */
  category?: MessageCategory;
  /** Conversation history for multi-turn context */
  conversationHistory?: ChatMessage[];
}

/**
 * Output from the orchestrator. Superset of the existing ProcessorResult.
 */
export interface OrchestratorResult {
  response: string;
  classification: string;           // intent classification (capture/task/question/etc)
  stateChanges: StateChange[];
  provider: string;                 // which provider handled it
  category: MessageCategory;        // routing category
  toolsUsed?: string[];             // which tools were invoked
  agentSteps?: number;              // how many agent loop iterations
  usage?: TokenUsage;
}

/**
 * Existing state change type -- unchanged from claude-processor.ts
 */
export interface StateChange {
  type: 'add_todo' | 'update_goal' | 'add_capture' | 'update_status';
  data: any;
}
```

### Provider Base Class (`orchestrator/providers/base.ts`)

```typescript
import {
  LLMProvider,
  ProviderCapabilities,
  ChatRequest,
  ChatResponse,
  ToolChatRequest,
  ToolChatResponse,
} from '../types';

/**
 * Abstract base class for LLM providers.
 * Handles common patterns like error wrapping and availability checks.
 */
export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly name: string;
  abstract readonly displayName: string;
  abstract readonly capabilities: ProviderCapabilities;

  constructor(protected readonly apiKey: string) {}

  get isAvailable(): boolean {
    return !!this.apiKey;
  }

  abstract chat(request: ChatRequest): Promise<ChatResponse>;

  async chatWithTools(request: ToolChatRequest): Promise<ToolChatResponse> {
    if (!this.capabilities.toolUse) {
      throw new Error(`${this.name} does not support tool calling`);
    }
    // Subclasses with tool support override this
    throw new Error(`${this.name}.chatWithTools() not implemented`);
  }

  /**
   * Wrap a provider call with standard error handling.
   * Extracts rate limit info from response headers when available.
   */
  protected async withErrorHandling<T>(
    fn: () => Promise<T>,
    context: string,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const status = error?.status || error?.response?.status;
      if (status === 429) {
        throw new RateLimitError(this.name, error.message);
      }
      if (status === 503 || status === 502) {
        throw new ProviderUnavailableError(this.name, error.message);
      }
      throw new ProviderError(this.name, context, error.message);
    }
  }
}

// Custom error types for the orchestrator to handle
export class RateLimitError extends Error {
  constructor(public readonly provider: string, message: string) {
    super(`[${provider}] Rate limited: ${message}`);
    this.name = 'RateLimitError';
  }
}

export class ProviderUnavailableError extends Error {
  constructor(public readonly provider: string, message: string) {
    super(`[${provider}] Unavailable: ${message}`);
    this.name = 'ProviderUnavailableError';
  }
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly context: string,
    message: string,
  ) {
    super(`[${provider}] ${context}: ${message}`);
    this.name = 'ProviderError';
  }
}
```

### Classifier (`orchestrator/classifier.ts`)

```typescript
import { MessageCategory, ClassificationResult, OrchestratorInput } from './types';

/**
 * Lightweight, zero-LLM-call classifier.
 * Uses keyword heuristics and input properties to classify messages.
 * This avoids burning a rate-limited API call just to classify.
 */
export class MessageClassifier {

  classify(input: OrchestratorInput): ClassificationResult {
    // Forced category
    if (input.category) {
      return {
        category: input.category,
        confidence: 1.0,
        requiresTools: this.categoryNeedsTools(input.category),
        hasImage: !!input.contentContext?.imageBase64,
      };
    }

    const text = input.text.toLowerCase().trim();
    const hasImage = !!input.contentContext?.imageBase64;
    const hasUrl = !!input.contentContext?.url || /https?:\/\//.test(text);

    // Vision: image is present
    if (hasImage) {
      return {
        category: 'vision',
        confidence: 0.95,
        requiresTools: false,
        hasImage: true,
      };
    }

    // Web search: needs current info, has URLs, asks about weather/news/prices
    if (this.needsWebSearch(text) || hasUrl) {
      return {
        category: 'web_search',
        confidence: 0.8,
        requiresTools: true,
        hasImage: false,
      };
    }

    // State update: mentions todos, goals, progress, reminders
    if (this.isStateUpdate(text)) {
      return {
        category: 'state_update',
        confidence: 0.85,
        requiresTools: false,
        hasImage: false,
      };
    }

    // Code task: code keywords, technical questions
    if (this.isCodeTask(text)) {
      return {
        category: 'code_task',
        confidence: 0.75,
        requiresTools: false,
        hasImage: false,
      };
    }

    // Complex reasoning: long messages, analysis requests, planning
    if (this.isComplexReasoning(text)) {
      return {
        category: 'complex_reasoning',
        confidence: 0.7,
        requiresTools: false,
        hasImage: false,
      };
    }

    // Default: simple chat
    return {
      category: 'simple_chat',
      confidence: 0.6,
      requiresTools: false,
      hasImage: false,
    };
  }

  private needsWebSearch(text: string): boolean {
    const searchPatterns = [
      /what('s| is) the (latest|current|recent)/,
      /search for/,
      /look up/,
      /find (me |)(info|information|details|articles)/,
      /(today'?s?|current|latest) (news|weather|price|stock|score)/,
      /what happened/,
      /who (won|is winning)/,
      /when (is|does|did)/,
    ];
    return searchPatterns.some(p => p.test(text));
  }

  private isStateUpdate(text: string): boolean {
    const statePatterns = [
      /add (a |)(todo|task|reminder)/,
      /remind me/,
      /(update|change|set) (my |)(goal|status|priority)/,
      /i (did|finished|completed|done with)/,
      /mark .* (as |)(done|complete)/,
      /capture (this|that)/,
      /save (this|that)/,
      /note (this|that) down/,
    ];
    return statePatterns.some(p => p.test(text));
  }

  private isCodeTask(text: string): boolean {
    const codePatterns = [
      /```/,
      /write (a |)(function|code|script|program|class)/,
      /fix (this |the |my )?(bug|error|issue|code)/,
      /how (do i|to) (implement|code|program|build)/,
      /(explain|debug|refactor) (this |the )?(code|function|class)/,
      /what does this code/,
      /(typescript|javascript|python|java|rust|go|sql)\b/,
      /api (endpoint|route|call)/,
    ];
    return codePatterns.some(p => p.test(text));
  }

  private isComplexReasoning(text: string): boolean {
    // Long messages or explicit analysis/planning requests
    if (text.length > 500) return true;

    const complexPatterns = [
      /analyze/,
      /compare (and contrast)?/,
      /pros and cons/,
      /help me (think|plan|decide|figure out)/,
      /what (should|would) (i|you|we)/,
      /break (this |it )down/,
      /step by step/,
      /trade.?offs?/,
    ];
    return complexPatterns.some(p => p.test(text));
  }

  private categoryNeedsTools(category: MessageCategory): boolean {
    return category === 'web_search';
  }
}
```

### Rate Limiter (`orchestrator/rate-limiter.ts`)

```typescript
import { RateLimitState, RateLimitConfig } from './types';

/**
 * Default rate limit configs per provider (free tier).
 * These are conservative estimates -- actual limits may vary.
 */
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  groq:     { requestsPerMinute: 30,  tokensPerMinute: 14400,    backoffMs: 60_000 },
  gemini:   { requestsPerMinute: 15,  tokensPerMinute: 1_000_000, backoffMs: 60_000 },
  cerebras: { requestsPerMinute: 30,  tokensPerMinute: 60_000,   backoffMs: 60_000 },
};

/**
 * In-memory rate limit tracker.
 * Tracks request/token usage per provider per rolling 60-second window.
 * Automatically resets when the window expires.
 */
export class RateLimiter {
  private state: Map<string, RateLimitState> = new Map();
  private limits: Map<string, RateLimitConfig> = new Map();

  constructor(overrides?: Partial<Record<string, RateLimitConfig>>) {
    // Merge defaults with any overrides
    for (const [provider, config] of Object.entries(DEFAULT_LIMITS)) {
      this.limits.set(provider, { ...config, ...overrides?.[provider] });
    }
  }

  /**
   * Check whether a provider can accept a new request right now.
   */
  canUse(provider: string): boolean {
    const state = this.getState(provider);

    // If we're in a backoff period, check if it's expired
    if (state.isLimited && Date.now() < state.resetsAt) {
      return false;
    }

    // Reset window if expired
    if (Date.now() >= state.resetsAt) {
      this.resetWindow(provider);
    }

    const limit = this.limits.get(provider);
    if (!limit) return true; // unknown provider, allow

    return state.requestsRemaining > 0 && state.tokensRemaining > 0;
  }

  /**
   * Record that a request was made to a provider.
   * Call this AFTER a successful request.
   */
  recordUsage(provider: string, tokensUsed: number): void {
    const state = this.getState(provider);
    state.requestsRemaining = Math.max(0, state.requestsRemaining - 1);
    state.tokensRemaining = Math.max(0, state.tokensRemaining - tokensUsed);
    state.consecutiveErrors = 0;
    state.lastError = undefined;
  }

  /**
   * Record a rate limit error from a provider.
   * Puts the provider into backoff.
   */
  recordRateLimit(provider: string, retryAfterMs?: number): void {
    const state = this.getState(provider);
    const limit = this.limits.get(provider) || DEFAULT_LIMITS.groq;

    state.isLimited = true;
    state.requestsRemaining = 0;
    state.consecutiveErrors += 1;
    state.resetsAt = Date.now() + (retryAfterMs || limit.backoffMs);
    state.lastError = 'rate_limited';
  }

  /**
   * Record a non-rate-limit error (503, timeout, etc).
   * After 3 consecutive errors, temporarily disable the provider.
   */
  recordError(provider: string, error: string): void {
    const state = this.getState(provider);
    state.consecutiveErrors += 1;
    state.lastError = error;

    if (state.consecutiveErrors >= 3) {
      state.isLimited = true;
      const limit = this.limits.get(provider) || DEFAULT_LIMITS.groq;
      state.resetsAt = Date.now() + limit.backoffMs * 2; // longer backoff
    }
  }

  /**
   * Get the current state for all providers.
   * Useful for the /api/provider endpoint.
   */
  getAllStates(): Record<string, RateLimitState> {
    const result: Record<string, RateLimitState> = {};
    for (const [provider] of this.limits) {
      result[provider] = this.getState(provider);
    }
    return result;
  }

  private getState(provider: string): RateLimitState {
    if (!this.state.has(provider)) {
      this.resetWindow(provider);
    }
    return this.state.get(provider)!;
  }

  private resetWindow(provider: string): void {
    const limit = this.limits.get(provider) || DEFAULT_LIMITS.groq;
    this.state.set(provider, {
      provider,
      requestsRemaining: limit.requestsPerMinute,
      tokensRemaining: limit.tokensPerMinute,
      resetsAt: Date.now() + 60_000,
      isLimited: false,
      consecutiveErrors: 0,
    });
  }
}
```

### Provider Registry (`orchestrator/providers/registry.ts`)

```typescript
import { LLMProvider, OrchestratorConfig } from '../types';
import { GroqProvider } from './groq';
import { GeminiProvider } from './gemini';
import { CerebrasProvider } from './cerebras';

/**
 * Initializes all configured providers and provides lookup.
 * Supports 3 providers: Groq, Gemini, Cerebras.
 */
export class ProviderRegistry {
  private providers: Map<string, LLMProvider> = new Map();

  constructor(config: OrchestratorConfig) {
    // Initialize each provider if its API key is present
    if (config.providers.groq?.apiKey) {
      this.providers.set('groq', new GroqProvider(
        config.providers.groq.apiKey,
        config.providers.groq.model,
        config.providers.groq.visionModel,
      ));
    }

    if (config.providers.gemini?.apiKey) {
      this.providers.set('gemini', new GeminiProvider(
        config.providers.gemini.apiKey,
        config.providers.gemini.model,
      ));
    }

    if (config.providers.cerebras?.apiKey) {
      this.providers.set('cerebras', new CerebrasProvider(
        config.providers.cerebras.apiKey,
        config.providers.cerebras.model,
      ));
    }
  }

  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  getAvailable(): string[] {
    return Array.from(this.providers.keys());
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }
}
```

### Orchestrator (`orchestrator/index.ts`)

```typescript
import {
  OrchestratorConfig,
  OrchestratorInput,
  OrchestratorResult,
  RoutingDecision,
  MessageCategory,
  ChatMessage,
  StateChange,
  ToolChatRequest,
  ToolChatResponse,
  ToolDefinition,
} from './types';
import { MessageClassifier } from './classifier';
import { RateLimiter } from './rate-limiter';
import { ProviderRegistry } from './providers/registry';
import { RateLimitError, ProviderUnavailableError } from './providers/base';

// Re-export for backward compat with ClaudeProcessor consumer interface
export { OrchestratorInput, OrchestratorResult };

/**
 * Routing table: category -> preferred provider -> fallback chain.
 */
/**
 * Routing table: category -> preferred provider -> fallback chain.
 * Only 3 providers: Groq (fast), Gemini (smart), Cerebras (fast fallback).
 */
const ROUTING_TABLE: Record<MessageCategory, { preferred: string; fallbacks: string[] }> = {
  simple_chat:        { preferred: 'groq',     fallbacks: ['cerebras', 'gemini'] },
  complex_reasoning:  { preferred: 'gemini',   fallbacks: ['groq', 'cerebras'] },
  web_search:         { preferred: 'gemini',   fallbacks: ['groq', 'cerebras'] },
  vision:             { preferred: 'gemini',   fallbacks: ['groq'] },
  code_task:          { preferred: 'groq',     fallbacks: ['cerebras', 'gemini'] },
  state_update:       { preferred: 'groq',     fallbacks: ['cerebras', 'gemini'] },
};

/**
 * The Orchestrator is the main entry point for processing messages.
 * It classifies, routes, and optionally runs an agent loop.
 *
 * Drop-in replacement for ClaudeProcessor -- same process() method signature.
 */
export class Orchestrator {
  private readonly classifier: MessageClassifier;
  private readonly rateLimiter: RateLimiter;
  private readonly registry: ProviderRegistry;
  private readonly config: OrchestratorConfig;

  /** Injected dependency: state manager for building system prompts */
  private stateManager: {
    getGoals(): Promise<{ raw: string }>;
    getCurrentState(): Promise<{ raw?: string }>;
    getTodos(): Promise<{ raw?: string }>;
  };

  /** Tool definitions registered for agent loop */
  private tools: ToolDefinition[] = [];
  /** Tool executors keyed by tool name */
  private toolExecutors: Map<string, (args: Record<string, any>) => Promise<string>> = new Map();

  constructor(
    config: OrchestratorConfig,
    stateManager: {
      getGoals(): Promise<{ raw: string }>;
      getCurrentState(): Promise<{ raw?: string }>;
      getTodos(): Promise<{ raw?: string }>;
    },
  ) {
    this.config = config;
    this.stateManager = stateManager;
    this.classifier = new MessageClassifier();
    this.rateLimiter = new RateLimiter(config.rateLimits);
    this.registry = new ProviderRegistry(config);
  }

  /**
   * Register a tool that the agent loop can use.
   */
  registerTool(
    definition: ToolDefinition,
    executor: (args: Record<string, any>) => Promise<string>,
  ): void {
    this.tools.push(definition);
    this.toolExecutors.set(definition.name, executor);
  }

  /**
   * Main entry point. Backward compatible with ClaudeProcessor.processMessage().
   */
  async processMessage(input: OrchestratorInput): Promise<OrchestratorResult> {
    // 1. Classify the message
    const classification = this.classifier.classify(input);

    // 2. Resolve routing decision
    const routing = this.resolveRouting(input, classification.category);

    // 3. Build messages array (system prompt + user message)
    const messages = await this.buildMessages(input);

    // 4. Execute with fallback chain
    let lastError: Error | null = null;
    const chain = [routing.provider, ...routing.fallbackChain];

    for (const providerName of chain) {
      const provider = this.registry.get(providerName);
      if (!provider || !provider.isAvailable) continue;
      if (!this.rateLimiter.canUse(providerName)) continue;

      try {
        let result: OrchestratorResult;

        if (classification.requiresTools && provider.capabilities.toolUse && this.tools.length > 0) {
          // Agent loop path
          result = await this.runAgentLoop(provider, messages, classification, input);
        } else {
          // Simple chat path
          const response = await provider.chat({
            messages,
            jsonMode: true,
            temperature: 0.7,
            maxTokens: 1024,
          });

          this.rateLimiter.recordUsage(providerName, response.usage?.totalTokens || 500);

          const parsed = this.parseStructuredResponse(response.content);
          result = {
            ...parsed,
            provider: providerName,
            category: classification.category,
            usage: response.usage,
          };
        }

        return result;
      } catch (error: any) {
        lastError = error;

        if (error instanceof RateLimitError) {
          this.rateLimiter.recordRateLimit(providerName);
          console.warn(`[orchestrator] ${providerName} rate limited, trying next...`);
        } else if (error instanceof ProviderUnavailableError) {
          this.rateLimiter.recordError(providerName, error.message);
          console.warn(`[orchestrator] ${providerName} unavailable, trying next...`);
        } else {
          this.rateLimiter.recordError(providerName, error.message);
          console.error(`[orchestrator] ${providerName} error:`, error.message);
        }
      }
    }

    // All providers failed
    throw lastError || new Error('No available LLM providers');
  }

  // --- Backward Compatibility Aliases ---

  getDefaultProvider(): string {
    return this.config.defaultProvider;
  }

  getAvailableProviders(): string[] {
    return this.registry.getAvailable();
  }

  // --- Private Methods ---

  private resolveRouting(
    input: OrchestratorInput,
    category: MessageCategory,
  ): RoutingDecision {
    // If a specific provider was requested, use it directly
    if (input.provider && this.registry.has(input.provider)) {
      return {
        provider: input.provider,
        category,
        fallbackChain: [],
        reason: `User requested provider: ${input.provider}`,
      };
    }

    // If smart routing is disabled, use default
    if (!this.config.smartRouting) {
      return {
        provider: this.config.defaultProvider,
        category,
        fallbackChain: ROUTING_TABLE.simple_chat.fallbacks,
        reason: 'Smart routing disabled',
      };
    }

    // Use routing table
    const route = ROUTING_TABLE[category];

    // Filter to only available, non-rate-limited providers
    const preferred = this.rateLimiter.canUse(route.preferred) && this.registry.has(route.preferred)
      ? route.preferred
      : route.fallbacks.find(p => this.rateLimiter.canUse(p) && this.registry.has(p)) || this.config.defaultProvider;

    const fallbacks = route.fallbacks.filter(
      p => p !== preferred && this.registry.has(p)
    );

    return {
      provider: preferred,
      category,
      fallbackChain: fallbacks,
      reason: `${category} -> ${preferred}`,
    };
  }

  private async buildMessages(input: OrchestratorInput): Promise<ChatMessage[]> {
    // Load state context (same as current ClaudeProcessor)
    const [goalsData, currentData, todosData] = await Promise.all([
      this.stateManager.getGoals(),
      this.stateManager.getCurrentState(),
      this.stateManager.getTodos(),
    ]);

    const systemPrompt = buildSystemPrompt(
      goalsData.raw || JSON.stringify(goalsData),
      currentData.raw || JSON.stringify(currentData),
      todosData.raw || JSON.stringify(todosData),
    );

    const userContent = this.buildUserContent(input);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Include conversation history if provided
    if (input.conversationHistory) {
      messages.push(...input.conversationHistory);
    }

    messages.push({ role: 'user', content: userContent });

    return messages;
  }

  private buildUserContent(input: OrchestratorInput): string | ContentPart[] {
    // If there's an image, return multimodal content parts
    if (input.contentContext?.imageBase64) {
      const parts: ContentPart[] = [];
      parts.push({
        type: 'image',
        data: input.contentContext.imageBase64,
        mimeType: input.contentContext.imageMimeType || 'image/jpeg',
      });
      parts.push({ type: 'text', text: this.buildTextContent(input) });
      return parts;
    }

    return this.buildTextContent(input);
  }

  private buildTextContent(input: OrchestratorInput): string {
    const parts: string[] = [];

    if (input.contentContext) {
      const ctx = input.contentContext;
      if (ctx.url) parts.push(`[Shared Content]\nURL: ${ctx.url}`);
      if (ctx.title) parts.push(`Title: ${ctx.title}`);
      if (ctx.summary) parts.push(`Summary: ${ctx.summary}`);
      if (parts.length > 0) parts.push('');
    }

    parts.push(input.text);
    return parts.join('\n');
  }

  /**
   * Run an agent loop for tasks that require tool use.
   * The provider calls tools, we execute them, and feed results back.
   */
  private async runAgentLoop(
    provider: LLMProvider,
    messages: ChatMessage[],
    classification: ClassificationResult,
    input: OrchestratorInput,
  ): Promise<OrchestratorResult> {
    const maxSteps = this.config.maxAgentSteps;
    let steps = 0;
    let currentMessages = [...messages];
    const toolsUsed: string[] = [];

    for (let i = 0; i < maxSteps; i++) {
      steps++;

      const response: ToolChatResponse = await provider.chatWithTools({
        messages: currentMessages,
        tools: this.tools,
        toolChoice: 'auto',
        jsonMode: false, // can't use JSON mode with tool calling
        temperature: 0.7,
        maxTokens: 1024,
      });

      this.rateLimiter.recordUsage(provider.name, response.usage?.totalTokens || 500);

      // If no tool calls, we're done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        const parsed = this.parseStructuredResponse(response.content);
        return {
          ...parsed,
          provider: provider.name,
          category: classification.category,
          toolsUsed,
          agentSteps: steps,
          usage: response.usage,
        };
      }

      // Add assistant message with tool calls
      currentMessages.push({
        role: 'assistant',
        content: response.content || '',
      });

      // Execute each tool call and add results
      for (const toolCall of response.toolCalls) {
        toolsUsed.push(toolCall.name);
        const executor = this.toolExecutors.get(toolCall.name);

        let toolResult: string;
        if (executor) {
          try {
            toolResult = await executor(toolCall.arguments);
          } catch (err: any) {
            toolResult = `Error: ${err.message}`;
          }
        } else {
          toolResult = `Error: Unknown tool "${toolCall.name}"`;
        }

        currentMessages.push({
          role: 'tool',
          content: toolResult,
          toolCallId: toolCall.id,
          name: toolCall.name,
        });
      }
    }

    // Max steps reached -- return what we have
    throw new Error(`Agent loop exceeded max steps (${maxSteps})`);
  }

  /**
   * Parse the LLM's JSON response into the structured format.
   * Same logic as current ClaudeProcessor.parseResponse().
   */
  private parseStructuredResponse(raw: string): {
    response: string;
    classification: string;
    stateChanges: StateChange[];
  } {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      return {
        response: String(parsed.response || ''),
        classification: parsed.classification || 'question',
        stateChanges: Array.isArray(parsed.stateChanges) ? parsed.stateChanges : [],
      };
    } catch {
      return {
        response: raw.trim(),
        classification: 'question',
        stateChanges: [],
      };
    }
  }
}

// The system prompt builder -- extracted from claude-processor.ts unchanged
function buildSystemPrompt(goals: string, current: string, todos: string): string {
  return `You are MARVIN, an AI Chief of Staff...`; // same as current
}
```

---

## Sequence Diagrams

### Normal Message Flow (Simple Chat)

```
User (Telegram/Android)
  |
  v
bot.ts / api.ts
  |
  v
Orchestrator.processMessage(input)
  |
  +--> MessageClassifier.classify(input)
  |      returns: { category: 'simple_chat', confidence: 0.6 }
  |
  +--> resolveRouting()
  |      returns: { provider: 'groq', fallbacks: ['cerebras', 'gemini'] }
  |
  +--> RateLimiter.canUse('groq') -> true
  |
  +--> buildMessages(input)
  |      loads state context from StateManager
  |      returns: [system, user] messages
  |
  +--> GroqProvider.chat(request)
  |      returns: ChatResponse with JSON content
  |
  +--> RateLimiter.recordUsage('groq', tokensUsed)
  |
  +--> parseStructuredResponse(content)
  |      returns: { response, classification, stateChanges }
  |
  v
OrchestratorResult returned to caller
```

### Rate Limit Fallback Flow

```
Orchestrator.processMessage(input)
  |
  +--> resolveRouting()
  |      returns: { provider: 'groq', fallbacks: ['cerebras', 'gemini'] }
  |
  +--> GroqProvider.chat(request)
  |      throws: RateLimitError
  |
  +--> RateLimiter.recordRateLimit('groq')
  |
  +--> CerebrasProvider.chat(request)    [next in fallback chain]
  |      returns: ChatResponse
  |
  +--> RateLimiter.recordUsage('cerebras', tokensUsed)
  |
  v
OrchestratorResult { provider: 'cerebras' }
```

### Agent Loop Flow (Web Search)

```
Orchestrator.processMessage(input)
  |
  +--> MessageClassifier.classify(input)
  |      returns: { category: 'web_search', requiresTools: true }
  |
  +--> resolveRouting()
  |      returns: { provider: 'gemini' }
  |
  +--> runAgentLoop(GeminiProvider, messages)
  |      |
  |      +--> Step 1: GeminiProvider.chatWithTools(messages, tools)
  |      |      returns: { toolCalls: [{ name: 'web_search', args: { query: '...' } }] }
  |      |
  |      +--> Execute web_search tool
  |      |      returns: search results as string
  |      |
  |      +--> Step 2: GeminiProvider.chatWithTools([...messages, toolResult])
  |      |      returns: { content: '...final response...', toolCalls: [] }
  |      |
  |      +--> No more tool calls -> parse and return
  |
  v
OrchestratorResult { provider: 'gemini', toolsUsed: ['web_search'], agentSteps: 2 }
```

### Vision Flow (Image + Text)

```
Telegram Photo Handler
  |
  +--> Downloads image, converts to base64
  |
  v
Orchestrator.processMessage({ text, contentContext: { imageBase64, imageMimeType } })
  |
  +--> MessageClassifier.classify()
  |      returns: { category: 'vision', hasImage: true }
  |
  +--> resolveRouting()
  |      returns: { provider: 'gemini', fallbacks: ['groq'] }
  |
  +--> buildMessages()
  |      returns: messages with ContentPart[] containing image + text
  |
  +--> GeminiProvider.chat(request)
  |      Gemini processes multimodal input
  |
  v
OrchestratorResult { provider: 'gemini', category: 'vision' }
```

---

## Integration Points (What Changes in Existing Code)

### `config.ts` -- Add Gemini + Cerebras API keys

```typescript
// New keys to add alongside existing Groq config:
geminiApiKey: process.env.GEMINI_API_KEY || '',
geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
cerebrasApiKey: process.env.CEREBRAS_API_KEY || '',
cerebrasModel: process.env.CEREBRAS_MODEL || 'qwen-3-235b',
smartRouting: process.env.SMART_ROUTING !== 'false',  // enabled by default
```

### `index.ts` -- Swap ClaudeProcessor for Orchestrator

```typescript
// Before:
const claudeProcessor = new ClaudeProcessor(stateManager);

// After:
const orchestrator = new Orchestrator(orchestratorConfig, stateManager);
// Register tools (web search, state tools, etc.)
registerTools(orchestrator, stateManager, contentFetcher);
// The deps object wraps orchestrator.processMessage() same as before
```

### `telegram/bot.ts` -- No Changes

The Telegram bot already communicates through the `BotClaudeProcessor` interface which only requires `process(text, context)`. The `index.ts` wrapper maps `Orchestrator.processMessage()` to this same shape. Zero changes needed.

### `routes/api.ts` -- Minimal Changes

The `/api/provider` endpoint expands to show all available providers instead of just groq/anthropic. The `process()` wrapper in `index.ts` handles the mapping.

---

## Tool Definitions

### Tools to Register

| Tool | Provider | Description |
|------|----------|-------------|
| `web_search` | Gemini grounding (native) / DuckDuckGo API for Groq/Cerebras fallback | Search the web for current information |
| `read_state` | Local | Read MARVIN state (goals, todos, current) |
| `add_todo` | Local | Add a new todo item |
| `update_goal` | Local | Update a goal's status |
| `add_capture` | Local | Save a capture/note to inbox |
| `fetch_url` | Local | Fetch and summarize a URL |

For Gemini, web search is built-in via the grounding API -- it does not need an explicit tool definition. For Groq/Cerebras fallbacks that get `web_search` tasks, we use DuckDuckGo's free API as the tool implementation.

---

## Implementation Order

Each task should be done in order since later tasks depend on earlier ones.

### Phase 1: Foundation (Task #2 -- this document)
- [x] Analyze existing codebase
- [x] Design interfaces and architecture
- [x] Write this document

### Phase 2: Provider Implementations (Tasks #3, #5)
1. **Gemini Provider** (Task #3) -- highest priority, handles web search + vision
   - Implement `GeminiProvider extends BaseLLMProvider`
   - Support chat, vision (multimodal), tool calling, and web search grounding
   - Use `@google/generative-ai` SDK or raw REST API

2. **Cerebras Provider** (Task #5)
   - OpenAI-compatible API (same pattern as current Groq implementation)
   - `CerebrasProvider` -- ultra-fast inference fallback

### Phase 3: Orchestrator Core (Tasks #6, #7)
4. **Smart Router + Classifier** (Task #6)
   - Implement `MessageClassifier` (keyword-based, zero LLM calls)
   - Implement `RateLimiter` (in-memory, per-provider tracking)
   - Implement `ProviderRegistry`
   - Implement `Orchestrator` class with routing + fallback chain

5. **Agent Loop + Tools** (Task #7)
   - Implement tool definitions and executors
   - Implement agent loop in `Orchestrator.runAgentLoop()`
   - Wire up web search (Gemini grounding + DuckDuckGo fallback)
   - Wire up state tools (read/write MARVIN state)

### Phase 4: Integration (Tasks #8, #9)
6. **Config + Environment** (Task #8)
   - Update `config.ts` with new provider keys
   - Update `.env.example` with new variables
   - Build `OrchestratorConfig` from `config` object

7. **Wire Into Existing App** (Task #9)
   - Replace `ClaudeProcessor` instantiation in `index.ts` with `Orchestrator`
   - Keep `ClaudeProcessor` export as deprecated alias
   - Update `/api/provider` endpoint for multi-provider list
   - Verify Telegram bot works unchanged

### Phase 5: Testing (Task #10)
8. **End-to-End Testing**
   - Test each provider individually
   - Test classification accuracy
   - Test fallback chain (simulate rate limits)
   - Test agent loop with web search
   - Test backward compatibility (only GROQ_API_KEY set)

---

## Backward Compatibility Guarantees

1. **If only `GROQ_API_KEY` is set**: Orchestrator behaves identically to current `ClaudeProcessor`. All messages route to Groq. No other providers initialized.

2. **Same `process()` interface**: The wrapper in `index.ts` maps orchestrator output to the same `{ response, classification, provider }` shape that `bot.ts` and `api.ts` expect.

3. **Same state change handling**: State changes are processed by the same code in `index.ts` (the `for (const change of result.stateChanges)` loop).

4. **Same transcription**: Groq Whisper transcription is completely separate from the orchestrator and stays unchanged.

5. **`ClaudeProcessor` kept as alias**: The export from `claude-processor.ts` is preserved as a thin wrapper around `Orchestrator` for any code that imports it directly.

---

## NPM Dependencies to Add

```json
{
  "@google/generative-ai": "^0.21.0"
}
```

No other new dependencies needed. Cerebras uses an OpenAI-compatible REST API that can be called with `fetch()` directly (same pattern as current Groq implementation).
