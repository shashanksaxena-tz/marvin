import {
  ChatRequest,
  ChatResponse,
  ToolChatRequest,
  ToolChatResponse,
  ToolCall,
  ProviderCapabilities,
  ChatMessage,
} from '../types';
import { BaseLLMProvider, RateLimitError, ProviderUnavailableError, ProviderError } from './base';

// ---------------------------------------------------------------------------
// Cerebras Provider - Ultra-fast inference, OpenAI-compatible API
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'qwen-3-235b-a22b-instruct-2507';
const API_URL = 'https://api.cerebras.ai/v1/chat/completions';

interface CerebrasToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface CerebrasApiResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: CerebrasToolCall[];
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

export class CerebrasProvider extends BaseLLMProvider {
  readonly name = 'cerebras';
  readonly displayName = 'Cerebras (Qwen)';
  readonly capabilities: ProviderCapabilities = {
    chat: true,
    vision: false,
    toolUse: true,
    jsonMode: true,
    webSearch: false,
    maxContextTokens: 131072,
    maxOutputTokens: 4096,
  };

  private readonly defaultModel: string;

  constructor(apiKey: string, model?: string) {
    super(apiKey);
    this.defaultModel = model || DEFAULT_MODEL;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.withErrorHandling(async () => {
      const model = request.model || this.defaultModel;

      const body: Record<string, any> = {
        model,
        messages: this.formatMessages(request.messages),
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
      };

      if (request.jsonMode) {
        body.response_format = { type: 'json_object' };
      }

      const data = await this.callApi(body);
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new ProviderError(this.name, 'chat', 'No content in response');
      }

      return {
        content,
        model: data.model || model,
        provider: this.name,
        usage: this.mapUsage(data),
        finishReason: this.mapFinishReason(data.choices[0].finish_reason),
      };
    }, 'chat');
  }

  async chatWithTools(request: ToolChatRequest): Promise<ToolChatResponse> {
    return this.withErrorHandling(async () => {
      const model = request.model || this.defaultModel;

      const body: Record<string, any> = {
        model,
        messages: this.formatMessages(request.messages),
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
        tools: request.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
        parallel_tool_calls: false,
      };

      if (request.toolChoice) {
        if (typeof request.toolChoice === 'string') {
          body.tool_choice = request.toolChoice;
        } else {
          body.tool_choice = { type: 'function', function: { name: request.toolChoice.name } };
        }
      }

      if (request.jsonMode) {
        body.response_format = { type: 'json_object' };
      }

      const data = await this.callApi(body);
      const msg = data.choices?.[0]?.message;

      const toolCalls: ToolCall[] | undefined = msg?.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));

      return {
        content: msg?.content || '',
        model: data.model || model,
        provider: this.name,
        usage: this.mapUsage(data),
        finishReason: this.mapFinishReason(data.choices[0].finish_reason),
        toolCalls,
      };
    }, 'chatWithTools');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async callApi(body: Record<string, any>): Promise<CerebrasApiResponse> {
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

    return (await response.json()) as CerebrasApiResponse;
  }

  /**
   * Convert ChatMessage[] to OpenAI-compatible format.
   * Cerebras does not support vision, so image parts are stripped.
   */
  private formatMessages(messages: ChatMessage[]): any[] {
    return messages.map((msg) => {
      if (typeof msg.content === 'string') {
        const formatted: any = { role: msg.role, content: msg.content };
        if (msg.role === 'tool' && msg.toolCallId) {
          formatted.tool_call_id = msg.toolCallId;
        }
        return formatted;
      }

      // Extract only text parts (no vision support)
      const textContent = (msg.content as Array<{ type: string; text?: string }>)
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('\n');

      return { role: msg.role, content: textContent || '' };
    });
  }

  private mapUsage(data: CerebrasApiResponse) {
    return data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    } : undefined;
  }

  private mapFinishReason(reason: string): ChatResponse['finishReason'] {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'tool_calls': return 'tool_calls';
      default: return 'stop';
    }
  }
}
