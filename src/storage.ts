import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const RETENTION_DAYS = 7;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface StoredFingerprint {
  serverUrl: string;
  toolName: string;
  fingerprint: string;
  description: string;
  inputSchema: string;
  firstSeen: number;
  lastSeen: number;
}

export interface HistoryRow {
  id: number;
  serverUrl: string;
  toolName: string;
  fingerprint: string;
  canonicalPayload: string;
  observedAt: number;
}

export interface DriftEventRow {
  id: number;
  serverUrl: string;
  toolName: string;
  oldFingerprint: string;
  newFingerprint: string;
  detectedAt: number;
  diffSummary: string;
}

export function defaultDbPath(): string {
  if (process.env.MCP_WATCH_DB) return process.env.MCP_WATCH_DB;
  return join(homedir(), '.opensyber', 'mcp-watch.db');
}

export class Storage {
  private db: Database.Database;

  constructor(path: string = defaultDbPath()) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_fingerprints (
        server_url TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        description TEXT NOT NULL,
        input_schema TEXT NOT NULL,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        PRIMARY KEY (server_url, tool_name)
      );

      CREATE TABLE IF NOT EXISTS fingerprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_url TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        canonical_payload TEXT NOT NULL,
        observed_at INTEGER NOT NULL,
        UNIQUE(server_url, tool_name, fingerprint, observed_at)
      );

      CREATE INDEX IF NOT EXISTS idx_fingerprints_lookup
        ON fingerprints(server_url, tool_name, observed_at);

      CREATE TABLE IF NOT EXISTS drift_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_url TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        old_fingerprint TEXT NOT NULL,
        new_fingerprint TEXT NOT NULL,
        detected_at INTEGER NOT NULL,
        diff_summary TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_drift_events_lookup
        ON drift_events(server_url, tool_name, detected_at);
    `);
  }

  getCurrent(serverUrl: string, toolName: string): StoredFingerprint | undefined {
    const row = this.db
      .prepare(
        `SELECT server_url AS serverUrl, tool_name AS toolName, fingerprint,
                description, input_schema AS inputSchema,
                first_seen AS firstSeen, last_seen AS lastSeen
         FROM tool_fingerprints
         WHERE server_url = ? AND tool_name = ?`,
      )
      .get(serverUrl, toolName) as StoredFingerprint | undefined;
    return row;
  }

  upsertCurrent(fp: StoredFingerprint): void {
    this.db
      .prepare(
        `INSERT INTO tool_fingerprints
           (server_url, tool_name, fingerprint, description, input_schema, first_seen, last_seen)
         VALUES (@serverUrl, @toolName, @fingerprint, @description, @inputSchema, @firstSeen, @lastSeen)
         ON CONFLICT(server_url, tool_name) DO UPDATE SET
           fingerprint = excluded.fingerprint,
           description = excluded.description,
           input_schema = excluded.input_schema,
           last_seen = excluded.last_seen`,
      )
      .run(fp);
  }

  appendHistory(row: Omit<HistoryRow, 'id'>): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO fingerprints
           (server_url, tool_name, fingerprint, canonical_payload, observed_at)
         VALUES (@serverUrl, @toolName, @fingerprint, @canonicalPayload, @observedAt)`,
      )
      .run(row);
  }

  appendDriftEvent(row: Omit<DriftEventRow, 'id'>): void {
    this.db
      .prepare(
        `INSERT INTO drift_events
           (server_url, tool_name, old_fingerprint, new_fingerprint, detected_at, diff_summary)
         VALUES (@serverUrl, @toolName, @oldFingerprint, @newFingerprint, @detectedAt, @diffSummary)`,
      )
      .run(row);
  }

  history(serverUrl: string, toolName: string, limit = 100): HistoryRow[] {
    return this.db
      .prepare(
        `SELECT id, server_url AS serverUrl, tool_name AS toolName, fingerprint,
                canonical_payload AS canonicalPayload, observed_at AS observedAt
         FROM fingerprints
         WHERE server_url = ? AND tool_name = ?
         ORDER BY observed_at DESC
         LIMIT ?`,
      )
      .all(serverUrl, toolName, limit) as HistoryRow[];
  }

  driftEvents(serverUrl?: string, toolName?: string, limit = 50): DriftEventRow[] {
    if (serverUrl && toolName) {
      return this.db
        .prepare(
          `SELECT id, server_url AS serverUrl, tool_name AS toolName,
                  old_fingerprint AS oldFingerprint, new_fingerprint AS newFingerprint,
                  detected_at AS detectedAt, diff_summary AS diffSummary
           FROM drift_events
           WHERE server_url = ? AND tool_name = ?
           ORDER BY detected_at DESC LIMIT ?`,
        )
        .all(serverUrl, toolName, limit) as DriftEventRow[];
    }
    return this.db
      .prepare(
        `SELECT id, server_url AS serverUrl, tool_name AS toolName,
                old_fingerprint AS oldFingerprint, new_fingerprint AS newFingerprint,
                detected_at AS detectedAt, diff_summary AS diffSummary
         FROM drift_events
         ORDER BY detected_at DESC LIMIT ?`,
      )
      .all(limit) as DriftEventRow[];
  }

  prune(now: number = Date.now()): number {
    const cutoff = now - RETENTION_MS;
    const result = this.db
      .prepare(`DELETE FROM fingerprints WHERE observed_at < ?`)
      .run(cutoff);
    this.db.prepare(`DELETE FROM drift_events WHERE detected_at < ?`).run(cutoff);
    return Number(result.changes);
  }

  close(): void {
    this.db.close();
  }
}
