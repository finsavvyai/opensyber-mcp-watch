import type { DriftVerdict } from '@opensyber/mcp-watch-core';
import type { FleetEntry } from '../fleet.js';
import type { ChainVerification } from '../audit.js';

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

export interface AuditEntry {
  seq: number;
  prevHmac: string;
  payload: unknown;
  hmac: string;
  createdAt: number;
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
  /** Append a hash-chained audit entry for this org and return it. */
  appendAudit(orgId: string, payload: unknown, at: number): Promise<AuditEntry>;
  getAuditChain(orgId: string): Promise<AuditEntry[]>;
  /** Recompute the org's audit chain and report whether it is intact. */
  verifyAudit(orgId: string): Promise<ChainVerification>;
  close(): Promise<void>;
}
