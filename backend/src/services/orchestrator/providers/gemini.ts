import {
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ContentPart,
  ToolChatRequest,
  ToolChatResponse,
  ToolCall,
  ToolDefinition,
  ProviderCapabilities,
  TokenUsage,
} from '../types';
import { BaseLLMProvider, RateLimitError, ProviderUnavailableError, ProviderError } from './base';

// ---------------------------------------------------------------------------
// Gemini REST API types
// ---------------------------------------------------------------------------

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, any> };
  functionResponse?: { name: string; response: Record<string, any> };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiTool {
  functionDeclarations?: GeminiFunctionDeclaration[];
  googleSearch?: Record<string, never>;
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

interface GeminiToolConfig {
  functionCallingConfig?: {
    mode: 'AUTO' | 'ANY' | 'NONE';
    allowedFunctionNames?: string[];
  };
}

interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}

interface GeminiRequestBody {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
  generationConfig?: GeminiGenerationConfig;
}

interface GeminiCandidate {
  content: {
    parts: GeminiPart[];
    role: string;
  };
  finishReason?: string;
  groundingMetadata?: {
    webSearchQueries?: string[];
    groundingChunks?: Array<{ web?: { uri: string; title: string } }>;
    groundingSupports?: Array<{
      segment: { startIndex: number; endIndex: number; text: string };
      groundingChunkIndices: number[];
    }>;
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  error?: { code: number; message: string; status: string };
}

// ---------------------------------------------------------------------------
// Gemini Provider
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'gemini-2.0-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiProvider extends BaseLLMProvider {
  readonly name = 'gemini';
  readonly displayName = 'Google Gemini';
  readonly capabilities: ProviderCapabilities = {
    chat: true,
    vision: true,
    toolUse: true,
    jsonMode: true,
    webSearch: true,
    maxContextTokens: 1_000_000,
    maxOutputTokens: 8192,
  };

  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    super(apiKey);
    this.model = model || DEFAULT_MODEL;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.withErrorHandling(async () => {
      const model = request.model || this.model;
      const body = this.buildRequestBody(request);
      const data = await this.callApi(model, body);
      return this.parseResponse(data, model);
    }, 'chat');
  }

  async chatWithTools(request: ToolChatRequest): Promise<ToolChatResponse> {
    return this.withErrorHandling(async () => {
      const model = request.model || this.model;
      const body = this.buildToolRequestBody(request);
      const data = await this.callApi(model, body);
      return this.parseToolResponse(data, model);
    }, 'chatWithTools');
  }

  // ---------------------------------------------------------------------------
  // Request building
  // ---------------------------------------------------------------------------

  private buildRequestBody(request: ChatRequest): GeminiRequestBody {
    const { systemInstruction, contents } = this.convertMessages(request.messages);

    const generationConfig: GeminiGenerationConfig = {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxTokens ?? 1024,
    };

    if (request.jsonMode) {
      generationConfig.responseMimeType = 'application/json';
    }

    return {
      contents,
      ...(systemInstruction && { systemInstruction }),
      generationConfig,
    };
  }

  private buildToolRequestBody(request: ToolChatRequest): GeminiRequestBody {
    const body = this.buildRequestBody(request);

    // Never use JSON mode with tool calling
    if (body.generationConfig) {
      delete body.generationConfig.responseMimeType;
    }

    const tools: GeminiTool[] = [];

    // Add function declarations
    if (request.tools.length > 0) {
      tools.push({
        functionDeclarations: request.tools.map(t => this.convertToolDefinition(t)),
      });
    }

    if (tools.length > 0) {
      body.tools = tools;
    }

    // Map tool choice
    if (request.toolChoice) {
      body.toolConfig = this.convertToolChoice(request.toolChoice);
    }

    return body;
  }

  // ---------------------------------------------------------------------------
  // Message conversion: our format -> Gemini format
  // ---------------------------------------------------------------------------

  private convertMessages(messages: ChatMessage[]): {
    systemInstruction?: { parts: GeminiPart[] };
    contents: GeminiContent[];
  } {
    let systemInstruction: { parts: GeminiPart[] } | undefined;
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        const text = typeof msg.content === 'string'
          ? msg.content
          : msg.content.filter(p => p.type === 'text').map(p => (p as { type: 'text'; text: string }).text).join('\n');
        systemInstruction = { parts: [{ text }] };
        continue;
      }

      if (msg.role === 'tool') {
        // Tool results go as a user message with functionResponse parts
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: msg.name || 'unknown',
              response: { result: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) },
            },
          }],
        });
        continue;
      }

      const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
      const parts = this.convertContentToParts(msg.content);

      // Merge consecutive messages with the same role (Gemini requires alternating roles)
      const last = contents[contents.length - 1];
      if (last && last.role === geminiRole) {
        last.parts.push(...parts);
      } else {
        contents.push({ role: geminiRole, parts });
      }
    }

    return { systemInstruction, contents };
  }

  private convertContentToParts(content: string | ContentPart[]): GeminiPart[] {
    if (typeof content === 'string') {
      return [{ text: content }];
    }

    return content.map(part => {
      if (part.type === 'text') {
        return { text: part.text };
      }
      // Image part
      return {
        inlineData: {
          mimeType: part.mimeType,
          data: part.data,
        },
      };
    });
  }

  private convertToolDefinition(tool: ToolDefinition): GeminiFunctionDeclaration {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    };
  }

  private convertToolChoice(
    choice: 'auto' | 'none' | { name: string },
  ): GeminiToolConfig {
    if (choice === 'auto') {
      return { functionCallingConfig: { mode: 'AUTO' } };
    }
    if (choice === 'none') {
      return { functionCallingConfig: { mode: 'NONE' } };
    }
    // Specific function requested
    return {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [choice.name],
      },
    };
  }

  // ---------------------------------------------------------------------------
  // API call
  // ---------------------------------------------------------------------------

  private async callApi(model: string, body: GeminiRequestBody): Promise<GeminiResponse> {
    const url = `${BASE_URL}/models/${model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text();
      let errorMessage: string;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorText;
      } catch {
        errorMessage = errorText;
      }

      if (status === 429) {
        throw new RateLimitError(this.name, errorMessage);
      }
      if (status === 502 || status === 503) {
        throw new ProviderUnavailableError(this.name, errorMessage);
      }
      throw new ProviderError(this.name, 'api_call', `HTTP ${status}: ${errorMessage}`);
    }

    const data = await response.json() as GeminiResponse;

    // Check for API-level errors in the response body
    if (data.error) {
      const code = data.error.code;
      if (code === 429) {
        throw new RateLimitError(this.name, data.error.message);
      }
      if (code === 502 || code === 503) {
        throw new ProviderUnavailableError(this.name, data.error.message);
      }
      throw new ProviderError(this.name, 'api_response', data.error.message);
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Response parsing
  // ---------------------------------------------------------------------------

  private parseResponse(data: GeminiResponse, model: string): ChatResponse {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new ProviderError(this.name, 'parse', 'No candidates in response');
    }

    const textParts = candidate.content.parts
      .filter(p => p.text !== undefined)
      .map(p => p.text!);

    const content = textParts.join('');
    const usage = this.parseUsage(data);
    const finishReason = this.mapFinishReason(candidate.finishReason);

    return {
      content,
      model,
      provider: this.name,
      usage,
      finishReason,
    };
  }

  private parseToolResponse(data: GeminiResponse, model: string): ToolChatResponse {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new ProviderError(this.name, 'parse', 'No candidates in response');
    }

    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const part of candidate.content.parts) {
      if (part.text !== undefined) {
        textParts.push(part.text);
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${part.functionCall.name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
        });
      }
    }

    const usage = this.parseUsage(data);
    const finishReason = this.mapFinishReason(candidate.finishReason);

    return {
      content: textParts.join(''),
      model,
      provider: this.name,
      usage,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : finishReason,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  private parseUsage(data: GeminiResponse): TokenUsage | undefined {
    const meta = data.usageMetadata;
    if (!meta) return undefined;
    return {
      promptTokens: meta.promptTokenCount || 0,
      completionTokens: meta.candidatesTokenCount || 0,
      totalTokens: meta.totalTokenCount || 0,
    };
  }

  private mapFinishReason(reason?: string): ChatResponse['finishReason'] {
    switch (reason) {
      case 'STOP': return 'stop';
      case 'MAX_TOKENS': return 'length';
      case 'SAFETY':
      case 'RECITATION':
      case 'OTHER': return 'error';
      default: return 'stop';
    }
  }

  // ---------------------------------------------------------------------------
  // Web search grounding (public helper for the orchestrator)
  // ---------------------------------------------------------------------------

  /**
   * Chat with Google Search grounding enabled.
   * Gemini will automatically search the web and ground its response.
   * Returns the response plus any grounding metadata (sources, queries).
   */
  async chatWithGrounding(request: ChatRequest): Promise<ChatResponse & {
    groundingMetadata?: GeminiCandidate['groundingMetadata'];
  }> {
    return this.withErrorHandling(async () => {
      const model = request.model || this.model;
      const body = this.buildRequestBody(request);

      // Add Google Search grounding tool
      body.tools = [{ googleSearch: {} }];

      // JSON mode is not compatible with grounding
      if (body.generationConfig) {
        delete body.generationConfig.responseMimeType;
      }

      const data = await this.callApi(model, body);
      const baseResponse = this.parseResponse(data, model);
      const candidate = data.candidates?.[0];

      return {
        ...baseResponse,
        groundingMetadata: candidate?.groundingMetadata,
      };
    }, 'chatWithGrounding');
  }
}
