import {
  ChatRequest,
  ChatResponse,
  ToolChatRequest,
  ToolChatResponse,
  ProviderCapabilities,
  ChatMessage,
  ContentPart,
} from '../types';
import { BaseLLMProvider, RateLimitError, ProviderUnavailableError, ProviderError } from './base';

// ---------------------------------------------------------------------------
// Groq Provider - OpenAI-compatible API
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface GroqApiResponse {
  choices: Array<{
    message: {
      content: string | null;
    };
    finish_reason: string;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GroqProvider extends BaseLLMProvider {
  readonly name = 'groq';
  readonly displayName = 'Groq (Llama)';
  readonly capabilities: ProviderCapabilities = {
    chat: true,
    vision: true,
    toolUse: false,
    jsonMode: true,
    webSearch: false,
    maxContextTokens: 131072,
    maxOutputTokens: 4096,
  };

  private readonly defaultModel: string;
  private readonly visionModel: string;

  constructor(apiKey: string, model?: string, visionModel?: string) {
    super(apiKey);
    this.defaultModel = model || DEFAULT_MODEL;
    this.visionModel = visionModel || VISION_MODEL;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.withErrorHandling(async () => {
      const hasImage = this.messagesContainImage(request.messages);
      const model = request.model || (hasImage ? this.visionModel : this.defaultModel);

      const body: Record<string, any> = {
        model,
        messages: this.formatMessages(request.messages),
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
      };

      if (request.jsonMode) {
        body.response_format = { type: 'json_object' };
      }

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const status = response.status;
        if (status === 429) throw new RateLimitError(this.name, errorText);
        if (status === 502 || status === 503) throw new ProviderUnavailableError(this.name, errorText);
        throw new ProviderError(this.name, 'chat', `HTTP ${status}: ${errorText}`);
      }

      const data = (await response.json()) as GroqApiResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new ProviderError(this.name, 'chat', 'No content in response');
      }

      return {
        content,
        model: data.model || model,
        provider: this.name,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
        finishReason: this.mapFinishReason(data.choices[0].finish_reason),
      };
    }, 'chat');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private messagesContainImage(messages: ChatMessage[]): boolean {
    return messages.some(
      (m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image'),
    );
  }

  /**
   * Convert our ChatMessage[] to the OpenAI-compatible format Groq expects.
   */
  private formatMessages(messages: ChatMessage[]): any[] {
    return messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }

      // Multimodal content
      const parts = (msg.content as ContentPart[]).map((part) => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        }
        // image -> image_url for OpenAI-compatible API
        return {
          type: 'image_url',
          image_url: {
            url: `data:${part.mimeType};base64,${part.data}`,
          },
        };
      });

      return { role: msg.role, content: parts };
    });
  }

  private mapFinishReason(reason: string): ChatResponse['finishReason'] {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      default: return 'stop';
    }
  }
}
