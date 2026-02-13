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
