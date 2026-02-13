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
