import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LLMProvider = 'groq' | 'anthropic' | 'gemini' | 'cerebras';

export type IntentClassification =
  | 'capture'
  | 'task'
  | 'question'
  | 'content_connect'
  | 'update';

export interface StateChange {
  type: 'add_todo' | 'update_goal' | 'add_capture' | 'update_status';
  data: any;
}

export interface ProcessorInput {
  text: string;
  contentContext?: {
    url?: string;
    title?: string;
    summary?: string;
    imageBase64?: string;
    imageMimeType?: string;
    [key: string]: any;
  };
  /** Override the default provider for this request */
  provider?: LLMProvider;
}

export interface ProcessorResult {
  response: string;
  classification: IntentClassification;
  stateChanges: StateChange[];
  /** Which provider handled this request */
  provider: LLMProvider;
}

/**
 * Minimal interface for the StateManager dependency.
 * The real implementation lives in state-manager.ts.
 */
export interface StateManager {
  getFullContext(): Promise<string>;
  getGoals(): Promise<{ raw: string }>;
  getCurrentState(): Promise<{ raw?: string }>;
  getTodos(): Promise<{ raw?: string }>;
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  goals: string,
  current: string,
  todos: string,
): string {
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
// Groq LLM client (OpenAI-compatible API)
// ---------------------------------------------------------------------------

interface GroqChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

async function callGroq(
  systemPrompt: string,
  userMessage: string,
  imageBase64?: string,
  imageMimeType?: string,
): Promise<string> {
  // Use vision model if image is provided
  const model = imageBase64 ? config.groqVisionModel : config.groqModel;

  // Build user message content - multimodal if image present
  let userContent: any;
  if (imageBase64) {
    userContent = [
      {
        type: 'image_url',
        image_url: {
          url: `data:${imageMimeType || 'image/jpeg'};base64,${imageBase64}`,
        },
      },
      { type: 'text', text: userMessage },
    ];
  } else {
    userContent = userMessage;
  }

  const requestBody: any = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: 1024,
    temperature: 0.7,
  };

  // Llama 4 Scout supports json_object for both text and vision
  requestBody.response_format = { type: 'json_object' };

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as GroqChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content in Groq response');
  }
  return content;
}

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------

async function callAnthropic(
  client: Anthropic,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const response = await client.messages.create({
    model: config.claudeModel,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }
  return textBlock.text;
}

// ---------------------------------------------------------------------------
// LLM Processor (supports Groq + Anthropic, switchable)
// ---------------------------------------------------------------------------

/**
 * Core processing service that supports multiple LLM providers.
 * Default: Groq (Llama 3.3 70B) for cost-effective processing.
 * Switch to Anthropic (Claude) for complex tasks when needed.
 *
 * Set LLM_PROVIDER env var or pass provider per-request.
 */
export class ClaudeProcessor {
  private anthropicClient: Anthropic | null = null;
  private readonly stateManager: StateManager;
  private readonly defaultProvider: LLMProvider;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.defaultProvider = config.llmProvider;

    // Only initialize Anthropic client if key is available
    if (config.anthropicApiKey) {
      this.anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
    }
  }

  /** Get the current default provider */
  getDefaultProvider(): LLMProvider {
    return this.defaultProvider;
  }

  /** Check which providers are available */
  getAvailableProviders(): LLMProvider[] {
    const providers: LLMProvider[] = [];
    if (config.groqApiKey) providers.push('groq');
    if (config.anthropicApiKey) providers.push('anthropic');
    return providers;
  }

  /**
   * Process an incoming message through the configured LLM.
   *
   * @param input - The processed input (transcribed voice, text, fetched content)
   * @param input.provider - Optional: override the default provider for this request
   * @returns Classification, response text, state changes, and which provider was used
   */
  async processMessage(input: ProcessorInput): Promise<ProcessorResult> {
    const provider = input.provider || this.defaultProvider;

    // Load current state for context
    const [goalsData, currentData, todosData] = await Promise.all([
      this.stateManager.getGoals(),
      this.stateManager.getCurrentState(),
      this.stateManager.getTodos(),
    ]);

    const goals = goalsData.raw || JSON.stringify(goalsData);
    const current = currentData.raw || JSON.stringify(currentData);
    const todos = todosData.raw || JSON.stringify(todosData);

    const systemPrompt = buildSystemPrompt(goals, current, todos);
    const userMessage = this.buildUserMessage(input);

    let rawResponse: string;

    // Extract image data if present in contentContext
    const imageBase64 = input.contentContext?.imageBase64 as string | undefined;
    const imageMimeType = input.contentContext?.imageMimeType as string | undefined;

    if (provider === 'anthropic') {
      if (!this.anthropicClient) {
        throw new Error('Anthropic provider requested but ANTHROPIC_API_KEY not configured');
      }
      rawResponse = await callAnthropic(this.anthropicClient, systemPrompt, userMessage);
    } else {
      if (!config.groqApiKey) {
        throw new Error('Groq provider requested but GROQ_API_KEY not configured');
      }
      rawResponse = await callGroq(systemPrompt, userMessage, imageBase64, imageMimeType);
    }

    const result = this.parseResponse(rawResponse);
    return { ...result, provider };
  }

  /**
   * Build the user message, incorporating any content context.
   */
  private buildUserMessage(input: ProcessorInput): string {
    const parts: string[] = [];

    if (input.contentContext) {
      const ctx = input.contentContext;
      parts.push('[Shared Content]');
      if (ctx.url) parts.push(`URL: ${ctx.url}`);
      if (ctx.title) parts.push(`Title: ${ctx.title}`);
      if (ctx.summary) parts.push(`Summary: ${ctx.summary}`);
      parts.push('');
    }

    parts.push(input.text);
    return parts.join('\n');
  }

  /**
   * Parse the LLM's JSON response into a structured result.
   * Falls back gracefully if the JSON is malformed.
   */
  private parseResponse(raw: string): Omit<ProcessorResult, 'provider'> {
    // Strip markdown code fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);

      const classification = this.validateClassification(parsed.classification);
      const stateChanges = this.validateStateChanges(parsed.stateChanges);

      return {
        response: String(parsed.response || ''),
        classification,
        stateChanges,
      };
    } catch {
      // If the LLM didn't return valid JSON, treat the whole response as a
      // question-answer with no state changes.
      return {
        response: raw.trim(),
        classification: 'question',
        stateChanges: [],
      };
    }
  }

  /**
   * Validate that the classification is one of the known intents.
   */
  private validateClassification(value: unknown): IntentClassification {
    const valid: IntentClassification[] = [
      'capture',
      'task',
      'question',
      'content_connect',
      'update',
    ];
    if (typeof value === 'string' && valid.includes(value as IntentClassification)) {
      return value as IntentClassification;
    }
    return 'question';
  }

  /**
   * Validate and sanitize state changes array.
   */
  private validateStateChanges(value: unknown): StateChange[] {
    if (!Array.isArray(value)) return [];

    const validTypes = ['add_todo', 'update_goal', 'add_capture', 'update_status'];
    return value.filter(
      (item): item is StateChange =>
        item != null &&
        typeof item === 'object' &&
        typeof item.type === 'string' &&
        validTypes.includes(item.type) &&
        item.data != null,
    );
  }
}
