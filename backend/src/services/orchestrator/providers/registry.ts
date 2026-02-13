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
