import type { DriftVerdict } from '@opensyber/mcp-watch-core';
import type { FleetEntry } from '../fleet.js';

/** Cross-agent divergence is a server-only verdict on top of core's temporal ones. */
export type ServerVerdict = DriftVerdict | 'fleet-divergence';

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
  verdict: ServerVerdict;
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
  /** Latest fingerprint per agent for a (server, tool) — powers fleet analysis. */
  getFleetFingerprints(orgId: string, serverUrl: string, toolName: string): Promise<FleetEntry[]>;
  saveDriftEvent(input: DriftEventInput): Promise<void>;
  close(): Promise<void>;
}
