import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * A single history item returned from queries.
 */
export interface HistoryItem {
  id: number;
  source: string;
  inputType: string;
  inputText: string;
  classification: string | null;
  response: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Aggregate stats about stored messages.
 */
export interface ConversationStats {
  totalMessages: number;
  byClassification: Record<string, number>;
  bySource: Record<string, number>;
}

/**
 * Raw row shape from SQLite before camelCase mapping.
 */
interface RawRow {
  id: number;
  source: string;
  input_type: string;
  input_text: string;
  classification: string | null;
  response: string | null;
  metadata: string | null;
  created_at: string;
}

/**
 * SQLite-backed conversation history for MARVIN.
 * Stores every message from all sources (Android, Telegram) with
 * classification, response, and optional metadata.
 */
export class ConversationHistory {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure the directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  /**
   * Run database migrations. Creates the messages table and FTS index
   * if they don't already exist.
   */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        input_type TEXT NOT NULL,
        input_text TEXT NOT NULL,
        classification TEXT,
        response TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_messages_source ON messages(source);
      CREATE INDEX IF NOT EXISTS idx_messages_classification ON messages(classification);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    `);

    // Full-text search virtual table for input_text and response
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        input_text,
        response,
        content='messages',
        content_rowid='id'
      );

      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, input_text, response)
        VALUES (new.id, new.input_text, COALESCE(new.response, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, input_text, response)
        VALUES ('delete', old.id, old.input_text, COALESCE(old.response, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, input_text, response)
        VALUES ('delete', old.id, old.input_text, COALESCE(old.response, ''));
        INSERT INTO messages_fts(rowid, input_text, response)
        VALUES (new.id, new.input_text, COALESCE(new.response, ''));
      END;
    `);
  }

  /**
   * Insert a new message and return the new row ID.
   */
  addMessage(msg: {
    source: string;
    inputType: string;
    inputText: string;
    classification?: string;
    response?: string;
    metadata?: Record<string, unknown>;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO messages (source, input_type, input_text, classification, response, metadata)
      VALUES (@source, @inputType, @inputText, @classification, @response, @metadata)
    `);

    const result = stmt.run({
      source: msg.source,
      inputType: msg.inputType,
      inputText: msg.inputText,
      classification: msg.classification ?? null,
      response: msg.response ?? null,
      metadata: msg.metadata ? JSON.stringify(msg.metadata) : null,
    });

    return result.lastInsertRowid as number;
  }

  /**
   * Retrieve conversation history with optional filtering and pagination.
   */
  getHistory(opts: {
    limit?: number;
    offset?: number;
    type?: string;
    source?: string;
  } = {}): HistoryItem[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (opts.type) {
      conditions.push('classification = @type');
      params.type = opts.type;
    }
    if (opts.source) {
      conditions.push('source = @source');
      params.source = opts.source;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const rows = this.db.prepare(`
      SELECT * FROM messages ${where}
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset }) as RawRow[];

    return rows.map(this.mapRow);
  }

  /**
   * Full-text search across input_text and response fields.
   */
  search(query: string, limit: number = 20): HistoryItem[] {
    const rows = this.db.prepare(`
      SELECT m.* FROM messages m
      JOIN messages_fts fts ON m.id = fts.rowid
      WHERE messages_fts MATCH @query
      ORDER BY rank
      LIMIT @limit
    `).all({ query, limit }) as RawRow[];

    return rows.map(this.mapRow);
  }

  /**
   * Get aggregate statistics about stored messages.
   */
  getStats(): ConversationStats {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };

    const classRows = this.db.prepare(
      'SELECT classification, COUNT(*) as count FROM messages GROUP BY classification'
    ).all() as Array<{ classification: string | null; count: number }>;

    const sourceRows = this.db.prepare(
      'SELECT source, COUNT(*) as count FROM messages GROUP BY source'
    ).all() as Array<{ source: string; count: number }>;

    const byClassification: Record<string, number> = {};
    for (const row of classRows) {
      byClassification[row.classification ?? 'unclassified'] = row.count;
    }

    const bySource: Record<string, number> = {};
    for (const row of sourceRows) {
      bySource[row.source] = row.count;
    }

    return {
      totalMessages: total.count,
      byClassification,
      bySource,
    };
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Map a raw SQLite row to a camelCase HistoryItem.
   */
  private mapRow(row: RawRow): HistoryItem {
    return {
      id: row.id,
      source: row.source,
      inputType: row.input_type,
      inputText: row.input_text,
      classification: row.classification,
      response: row.response,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at,
    };
  }
}
