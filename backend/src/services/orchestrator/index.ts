import {
  OrchestratorConfig,
  OrchestratorInput,
  OrchestratorResult,
  RoutingDecision,
  MessageCategory,
  ChatMessage,
  ContentPart,
  StateChange,
  LLMProvider,
  ToolDefinition,
  ToolChatResponse,
  ClassificationResult,
} from './types';
import { MessageClassifier } from './classifier';
import { RateLimiter } from './rate-limiter';
import { ProviderRegistry } from './providers/registry';
import { RateLimitError, ProviderUnavailableError } from './providers/base';

// Re-export for backward compat
export { OrchestratorInput, OrchestratorResult };
export type { OrchestratorConfig };

// ---------------------------------------------------------------------------
// Routing Table
// ---------------------------------------------------------------------------

/**
 * Category -> preferred provider -> fallback chain.
 * Only includes our 3 providers: groq, gemini, cerebras.
 */
const ROUTING_TABLE: Record<MessageCategory, { preferred: string; fallbacks: string[] }> = {
  simple_chat:       { preferred: 'groq',   fallbacks: ['cerebras', 'gemini'] },
  complex_reasoning: { preferred: 'gemini', fallbacks: ['groq', 'cerebras'] },
  web_search:        { preferred: 'gemini', fallbacks: ['groq'] },
  vision:            { preferred: 'gemini', fallbacks: ['groq'] },
  code_task:         { preferred: 'groq',   fallbacks: ['cerebras', 'gemini'] },
  state_update:      { preferred: 'groq',   fallbacks: ['cerebras', 'gemini'] },
};

/**
 * Max output tokens per category.
 * Simple tasks stay snappy, complex tasks get full response length.
 */
const MAX_TOKENS_BY_CATEGORY: Record<MessageCategory, number> = {
  simple_chat:       1024,
  complex_reasoning: 8192,  // Gemini max
  web_search:        4096,
  vision:            4096,
  code_task:         4096,
  state_update:      1024,
};

// ---------------------------------------------------------------------------
// System Prompt (migrated from claude-processor.ts)
// ---------------------------------------------------------------------------

function buildSystemPrompt(goals: string, current: string, todos: string): string {
  return `You are MARVIN, an AI Chief of Staff for Shashank Saxena. You are friendly, casual, and proactive. You keep things concise.

Your job is to process incoming messages (voice notes, texts, shared links) and:
1. Classify the intent
2. Respond helpfully
3. Suggest state changes (new todos, goal updates, captures, status updates)

## User Context

### Current Priorities
${current}

### Goals
${goals}

### Active Todos
${todos}

## Intent Classification

Classify every message into EXACTLY ONE of these categories:
- **capture**: User wants to save a thought, idea, note, or piece of information for later.
- **task**: User is describing something they need to do, an action item, or a reminder.
- **question**: User is asking a question and expects an answer or advice.
- **content_connect**: User shared a URL or content and wants it connected to their goals/projects.
- **update**: User is reporting progress or a status change on an existing goal or task.

## Response Guidelines

- For **capture**: Acknowledge briefly. Keep it to 1-2 sentences.
- For **task**: Confirm the task and suggest a clear, actionable todo item.
- For **question**: Answer helpfully. Be thorough but concise.
- For **content_connect**: Summarize the content and explain how it connects to existing goals/projects.
- For **update**: Acknowledge the progress and update the relevant status.

When content context is provided (URL, title, summary), use it to give better responses and connect it to the user's goals.

## Response Format

You MUST respond with valid JSON and nothing else. No markdown fences, no extra text.

{
  "response": "Your natural language response to the user",
  "classification": "capture|task|question|content_connect|update",
  "stateChanges": [
    {
      "type": "add_todo|update_goal|add_capture|update_status",
      "data": { ... }
    }
  ]
}

### stateChanges data shapes

- add_todo: { "text": "the task description", "context": "optional context" }
- update_goal: { "goal": "goal name", "status": "in_progress|done|blocked", "notes": "optional notes" }
- add_capture: { "text": "the captured thought/note", "tags": ["optional", "tags"] }
- update_status: { "item": "what is being updated", "status": "new status", "notes": "optional notes" }

If no state changes are needed, return an empty array for stateChanges.`;
}

// ---------------------------------------------------------------------------
// StateManager interface (minimal, same as claude-processor.ts)
// ---------------------------------------------------------------------------

export interface StateManagerDep {
  getGoals(): Promise<{ raw: string }>;
  getCurrentState(): Promise<{ raw?: string }>;
  getTodos(): Promise<{ raw?: string }>;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * The Orchestrator is the main entry point for processing messages.
 * It classifies, routes, and optionally runs an agent loop.
 *
 * Drop-in replacement for ClaudeProcessor -- same processMessage() signature.
 */
export class Orchestrator {
  private readonly classifier: MessageClassifier;
  private readonly rateLimiter: RateLimiter;
  private readonly registry: ProviderRegistry;
  private readonly config: OrchestratorConfig;
  private readonly stateManager: StateManagerDep;

  /** Tool definitions registered for agent loop */
  private tools: ToolDefinition[] = [];
  /** Tool executors keyed by tool name */
  private toolExecutors: Map<string, (args: Record<string, any>) => Promise<string>> = new Map();

  constructor(config: OrchestratorConfig, stateManager: StateManagerDep) {
    this.config = config;
    this.stateManager = stateManager;
    this.classifier = new MessageClassifier();
    this.rateLimiter = new RateLimiter(config.rateLimits);
    this.registry = new ProviderRegistry(config);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

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
          result = await this.runAgentLoop(provider, messages, classification, providerName);
        } else {
          // Simple chat path
          const maxTokens = Math.min(
            MAX_TOKENS_BY_CATEGORY[classification.category] || 1024,
            provider.capabilities.maxOutputTokens,
          );
          const response = await provider.chat({
            messages,
            jsonMode: true,
            temperature: 0.7,
            maxTokens,
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

  getRateLimitStates() {
    return this.rateLimiter.getAllStates();
  }

  // -------------------------------------------------------------------------
  // Private: Routing
  // -------------------------------------------------------------------------

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
      const available = this.registry.getAvailable()
        .filter((p: string) => p !== this.config.defaultProvider);
      return {
        provider: this.config.defaultProvider,
        category,
        fallbackChain: available,
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
      p => p !== preferred && this.registry.has(p),
    );

    return {
      provider: preferred,
      category,
      fallbackChain: fallbacks,
      reason: `${category} -> ${preferred}`,
    };
  }

  // -------------------------------------------------------------------------
  // Private: Message Building
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Private: Agent Loop
  // -------------------------------------------------------------------------

  /**
   * Run an agent loop for tasks that require tool use.
   * The provider calls tools, we execute them, and feed results back.
   */
  private async runAgentLoop(
    provider: LLMProvider,
    messages: ChatMessage[],
    classification: ClassificationResult,
    providerName: string,
  ): Promise<OrchestratorResult> {
    const maxSteps = this.config.maxAgentSteps;
    let steps = 0;
    const currentMessages = [...messages];
    const toolsUsed: string[] = [];

    for (let i = 0; i < maxSteps; i++) {
      steps++;

      const maxTokens = Math.min(
        MAX_TOKENS_BY_CATEGORY[classification.category] || 4096,
        provider.capabilities.maxOutputTokens,
      );
      const response: ToolChatResponse = await provider.chatWithTools({
        messages: currentMessages,
        tools: this.tools,
        toolChoice: 'auto',
        jsonMode: false, // can't use JSON mode with tool calling
        temperature: 0.7,
        maxTokens,
      });

      this.rateLimiter.recordUsage(providerName, response.usage?.totalTokens || 500);

      // If no tool calls, we're done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        const parsed = this.parseStructuredResponse(response.content);
        return {
          ...parsed,
          provider: providerName,
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

    // Max steps reached
    throw new Error(`Agent loop exceeded max steps (${maxSteps})`);
  }

  // -------------------------------------------------------------------------
  // Private: Response Parsing
  // -------------------------------------------------------------------------

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
