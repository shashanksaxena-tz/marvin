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
