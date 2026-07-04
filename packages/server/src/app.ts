import Fastify, { type FastifyInstance } from 'fastify';
import {
  classifyDrift,
  canonicalJson,
  fingerprintTool,
  type DriftResult,
} from '@opensyber/mcp-watch-core';
import { bearerToken, hashApiKey } from './auth.js';
import { analyzeFleet } from './fleet.js';
import type { Store } from './store/types.js';

/** One tool observation pushed by an agent. */
interface ToolObservation {
  toolName: string;
  fingerprint: string;
  description: string;
  inputSchema: unknown;
}

interface IngestBody {
  agentId: string;
  serverUrl: string;
  observedAt: number;
  tools: ToolObservation[];
}

interface ToolVerdict extends DriftResult {
  toolName: string;
  fingerprint: string;
  /** True when the agent-supplied fingerprint disagrees with the server recomputation. */
  fingerprintMismatch: boolean;
  /** Set when this agent disagrees with the org's fleet consensus for this tool. */
  fleetDivergence?: {
    consensusFingerprint: string;
    divergentAgents: string[];
  };
}

function isIngestBody(body: unknown): body is IngestBody {
  const b = body as Partial<IngestBody> | null;
  return !!b && typeof b.agentId === 'string' && typeof b.serverUrl === 'string' && Array.isArray(b.tools);
}

declare module 'fastify' {
  interface FastifyRequest {
    orgId: string | null;
  }
}

export function buildApp(store: Store): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorateRequest('orgId', null);

  // Authenticate every /v1/* route before the body is parsed, so unauthenticated
  // callers never reach body parsing (and get 401 rather than a 415).
  app.addHook('onRequest', async (req, reply) => {
    const path = (req.url.split('?')[0] ?? '');
    if (!path.startsWith('/v1/')) return;
    const token = bearerToken(req.headers.authorization);
    const orgId = token ? await store.resolveOrg(hashApiKey(token)) : null;
    if (!orgId) {
      await reply.code(401).send({ error: 'invalid or missing API key' });
      return reply;
    }
    req.orgId = orgId;
  });

  app.get('/healthz', async () => ({ ok: true, service: 'mcp-watch-server', phase: 4 }));

  app.post('/v1/ingest', async (req, reply) => {
    const orgId = req.orgId!; // guaranteed by the onRequest auth hook
    if (!isIngestBody(req.body)) {
      return reply.code(400).send({ error: "body must include agentId, serverUrl, and a tools array" });
    }
    const body = req.body;
    const verdicts: ToolVerdict[] = [];

    for (const tool of body.tools) {
      const name = tool.toolName;
      // Recompute the fingerprint server-side — never trust the agent's hash.
      const recomputed = await fingerprintTool({ name, description: tool.description, inputSchema: tool.inputSchema });
      const inputSchemaCanon = canonicalJson(tool.inputSchema);
      const canonicalPayload = canonicalJson({ name, description: tool.description, inputSchema: tool.inputSchema });

      const prior = await store.getLastSeen(orgId, body.serverUrl, name);
      const drift = classifyDrift({
        oldFingerprint: prior?.fingerprint ?? null,
        newFingerprint: recomputed,
        oldDescription: prior?.description ?? '',
        newDescription: tool.description,
        oldInputSchema: prior?.inputSchema ?? '',
        newInputSchema: inputSchemaCanon,
      });

      await store.saveObservation({
        orgId,
        agentExternalId: body.agentId,
        serverUrl: body.serverUrl,
        toolName: name,
        fingerprint: recomputed,
        description: tool.description,
        inputSchema: inputSchemaCanon,
        canonicalPayload,
        observedAt: body.observedAt,
      });

      if (drift.verdict === 'suspicious-injection' || drift.verdict === 'version-bump') {
        await store.saveDriftEvent({
          orgId,
          agentExternalId: body.agentId,
          serverUrl: body.serverUrl,
          toolName: name,
          verdict: drift.verdict,
          oldFingerprint: prior?.fingerprint ?? null,
          newFingerprint: recomputed,
          diffSummary: drift.diffSummary,
          detectedAt: body.observedAt,
        });
        await store.appendAudit(
          orgId,
          {
            kind: 'drift',
            agentId: body.agentId,
            serverUrl: body.serverUrl,
            toolName: name,
            verdict: drift.verdict,
            fingerprint: recomputed,
            observedAt: body.observedAt,
          },
          body.observedAt,
        );
      }

      // Cross-machine check: does this agent disagree with the fleet consensus?
      const fleet = analyzeFleet(
        await store.getFleetFingerprints(orgId, body.serverUrl, name),
        body.agentId,
      );
      const verdict: ToolVerdict = {
        toolName: name,
        fingerprint: recomputed,
        fingerprintMismatch: recomputed !== tool.fingerprint,
        ...drift,
      };
      if (fleet.divergent && fleet.consensusFingerprint) {
        verdict.fleetDivergence = {
          consensusFingerprint: fleet.consensusFingerprint,
          divergentAgents: fleet.divergentAgents,
        };
        await store.saveDriftEvent({
          orgId,
          agentExternalId: body.agentId,
          serverUrl: body.serverUrl,
          toolName: name,
          verdict: 'fleet-divergence',
          oldFingerprint: fleet.consensusFingerprint,
          newFingerprint: recomputed,
          diffSummary: `agent '${body.agentId}' diverges from fleet consensus (${fleet.agentCount} agents)`,
          detectedAt: body.observedAt,
        });
        await store.appendAudit(
          orgId,
          {
            kind: 'fleet-divergence',
            agentId: body.agentId,
            serverUrl: body.serverUrl,
            toolName: name,
            consensusFingerprint: fleet.consensusFingerprint,
            fingerprint: recomputed,
            observedAt: body.observedAt,
          },
          body.observedAt,
        );
      }
      verdicts.push(verdict);
    }

    const suspicious = verdicts.filter((v) => v.verdict === 'suspicious-injection').length;
    const fleetDivergences = verdicts.filter((v) => v.fleetDivergence).length;
    return reply.send({ org: orgId, accepted: verdicts.length, suspicious, fleetDivergences, verdicts });
  });

  // Tamper-evident audit export: the hash-chained detection record for this org,
  // plus a server-side verification of the chain's integrity.
  app.get('/v1/audit/export', async (req, reply) => {
    const orgId = req.orgId!;
    const [entries, verification] = await Promise.all([
      store.getAuditChain(orgId),
      store.verifyAudit(orgId),
    ]);
    return reply.send({
      org: orgId,
      algorithm: 'HMAC-SHA256 hash chain (per-org key)',
      count: entries.length,
      chainValid: verification.valid,
      brokenAt: verification.brokenAt,
      seal: entries.length > 0 ? entries[entries.length - 1]!.hmac : null,
      entries,
    });
  });

  // Read API for dashboards / SIEM pulls.
  app.get('/v1/tools', async (req, reply) => {
    return reply.send({ org: req.orgId, tools: await store.listTools(req.orgId!) });
  });

  app.get('/v1/events', async (req, reply) => {
    const q = req.query as { limit?: string } | undefined;
    const limit = Math.min(Math.max(Number(q?.limit ?? 50) || 50, 1), 500);
    return reply.send({ org: req.orgId, events: await store.listDriftEvents(req.orgId!, limit) });
  });

  return app;
}
