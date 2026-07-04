import Fastify, { type FastifyInstance } from 'fastify';
import {
  classifyDrift,
  canonicalJson,
  fingerprintTool,
  type DriftResult,
} from '@opensyber/mcp-watch-core';
import { bearerToken, hashApiKey } from './auth.js';
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

  // Authenticate before the body is parsed, so unauthenticated callers never
  // reach body parsing (and get 401 rather than a 415 on content-type).
  app.addHook('onRequest', async (req, reply) => {
    if (!(req.method === 'POST' && req.url === '/v1/ingest')) return;
    const token = bearerToken(req.headers.authorization);
    const orgId = token ? await store.resolveOrg(hashApiKey(token)) : null;
    if (!orgId) {
      await reply.code(401).send({ error: 'invalid or missing API key' });
      return reply;
    }
    req.orgId = orgId;
  });

  app.get('/healthz', async () => ({ ok: true, service: 'mcp-watch-server', phase: 1 }));

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
      }

      verdicts.push({
        toolName: name,
        fingerprint: recomputed,
        fingerprintMismatch: recomputed !== tool.fingerprint,
        ...drift,
      });
    }

    const suspicious = verdicts.filter((v) => v.verdict === 'suspicious-injection').length;
    return reply.send({ org: orgId, accepted: verdicts.length, suspicious, verdicts });
  });

  return app;
}
