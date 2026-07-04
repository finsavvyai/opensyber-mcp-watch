import type { DriftVerdict } from '@opensyber/mcp-watch-core';

/** The last fingerprint an org has seen for a given (server, tool). */
export interface LastSeen {
  fingerprint: string;
  description: string;
  /** canonical JSON of the tool's inputSchema */
  inputSchema: string;
}

export interface ObservationInput {
  orgId: string;
  agentExternalId: string;
  serverUrl: string;
  toolName: string;
  fingerprint: string;
  description: string;
  /** canonical JSON of inputSchema */
  inputSchema: string;
  /** canonical JSON of { name, description, inputSchema } */
  canonicalPayload: string;
  observedAt: number;
}

export interface DriftEventInput {
  orgId: string;
  agentExternalId: string;
  serverUrl: string;
  toolName: string;
  verdict: DriftVerdict;
  oldFingerprint: string | null;
  newFingerprint: string;
  diffSummary: string;
  detectedAt: number;
}

/**
 * Persistence boundary for the ingest service. Two implementations:
 * MemoryStore (tests/dev) and PgStore (production Postgres). Keeping this an
 * interface is what lets the HTTP + detection layers be tested without a DB.
 */
export interface Store {
  /** Resolve an API key hash to an org id, or null if unknown/revoked. */
  resolveOrg(apiKeyHash: string): Promise<string | null>;
  getLastSeen(orgId: string, serverUrl: string, toolName: string): Promise<LastSeen | null>;
  /** Append to history and update the org's current fingerprint for this tool. */
  saveObservation(input: ObservationInput): Promise<void>;
  saveDriftEvent(input: DriftEventInput): Promise<void>;
  close(): Promise<void>;
}
