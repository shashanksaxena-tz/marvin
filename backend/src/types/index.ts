// ============================================================
// Shared TypeScript interfaces for MARVIN backend
// ============================================================

// ---------- Message API ----------

export interface MessageRequest {
  text: string;
  source: string;
  /** Optional: override LLM provider for this request */
  provider?: 'groq' | 'anthropic';
}

export interface MessageResponse {
  response: string;
  classification: string;
  provider?: string;
}

// ---------- Voice API ----------

export interface VoiceResponse {
  response: string;
  classification: string;
  transcription: string;
}

// ---------- Share API ----------

export interface ShareRequest {
  url?: string;
  text?: string;
  image?: string; // base64
  context?: string;
}

export interface ShareResponse {
  response: string;
  summary?: string;
  connections: string[];
}

// ---------- Status API ----------

export interface StatusResponse {
  priorities: string[];
  todos: any;
  goals: any;
}

// ---------- History API ----------

export interface HistoryQuery {
  limit?: number;
  offset?: number;
  type?: string;
  search?: string;
}

export interface ConversationMessage {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
  source: string;
  classification?: string;
  timestamp: string;
}

export interface HistoryResponse {
  messages: any[];
  total: number;
}

// ---------- Health API ----------

export interface HealthResponse {
  status: 'ok';
  uptime: number;
  llmProvider?: string;
}

// ---------- Service interfaces (for dependency injection) ----------

export interface IClaudeProcessor {
  processMessage(input: {
    text: string;
    contentContext?: Record<string, any>;
    provider?: 'groq' | 'anthropic';
  }): Promise<{
    response: string;
    classification: string;
    stateChanges: any[];
    provider: string;
  }>;
  getDefaultProvider(): string;
  getAvailableProviders(): string[];
}

export interface IStateManager {
  getGoals(): Promise<any>;
  getTodos(): Promise<any>;
  getCurrentState(): Promise<any>;
  getPriorities(): Promise<string[]>;
  addTodo(task: string, context: string): Promise<void>;
  completeTodo(task: string, notes: string): Promise<void>;
  updateGoal(goal: string, status: string, notes: string): Promise<void>;
  addToInbox(item: any): Promise<void>;
  getFullContext(): Promise<string>;
  hasChanged(): boolean;
}

export interface IGitSync {
  initialize(): Promise<void>;
  pull(): Promise<void>;
  commitAndPush(message: string): Promise<void>;
  syncAfterChange(description: string): Promise<void>;
  isAvailable(): boolean;
}

export interface ITranscriptionService {
  isAvailable(): boolean;
  transcribe(audioBuffer: Buffer, filename?: string): Promise<{
    text: string;
    language?: string;
    duration?: number;
  }>;
}

export interface IContentFetcher {
  fetch(url: string): Promise<any>;
}

export interface IConversationHistory {
  addMessage(msg: {
    source: string;
    inputType: string;
    inputText: string;
    classification?: string;
    response?: string;
    metadata?: Record<string, any>;
  }): number;
  getHistory(opts?: {
    limit?: number;
    offset?: number;
    type?: string;
    source?: string;
  }): any[];
  search(query: string, limit?: number): any[];
  getStats(): any;
  close(): void;
}
