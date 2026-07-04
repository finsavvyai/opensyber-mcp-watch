export interface ServerEntry {
  name: string;
  url: string;
  headers?: Record<string, string>;
}

/** One row per tool per run (or one error row per failed server per run). */
export interface SnapshotRecord {
  runAt: number;
  serverName: string;
  serverUrl: string;
  toolName?: string;
  fingerprint?: string;
  description?: string;
  /** canonical JSON of inputSchema */
  inputSchema?: string;
  error?: string;
}
