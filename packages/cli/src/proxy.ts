import { createServer, type Server } from 'node:http';
import { fingerprintTool, canonicalJson, classifyDrift, type ToolDef } from '@opensyber/mcp-watch-core';
import type { Storage } from './storage.js';

export type ProxyPolicy = 'block' | 'warn' | 'log';

export interface ProxyDecision {
  toolName: string;
  verdict: string;
  reason: string;
  action: 'blocked' | 'warned';
}

export interface ProxyContext {
  upstreamUrl: string;
  headers?: Record<string, string>;
  storage: Storage;
  serverKey: string;
  policy: ProxyPolicy;
  fetchImpl?: typeof globalThis.fetch;
  onDecision?: (d: ProxyDecision) => void;
}

interface JsonRpc {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: { tools?: ToolDef[] } & Record<string, unknown>;
  error?: unknown;
}

/**
 * Forward one JSON-RPC message to the upstream MCP server. On a `tools/list`
 * response, each tool is fingerprinted and drift-classified against the stored
 * baseline; a `suspicious-injection` tool is recorded and — under the `block`
 * policy — stripped from the response so the agent never sees the poisoned tool.
 */
export async function forward(message: JsonRpc, ctx: ProxyContext): Promise<JsonRpc> {
  const fetchImpl = ctx.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(ctx.upstreamUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ctx.headers ?? {}) },
    body: JSON.stringify(message),
  });
  const body = (await res.json()) as JsonRpc;

  if (message.method !== 'tools/list' || !Array.isArray(body.result?.tools)) return body;

  const now = Date.now();
  const kept: ToolDef[] = [];
  for (const tool of body.result.tools) {
    const fp = await fingerprintTool(tool);
    const schema = canonicalJson(tool.inputSchema);
    const prior = ctx.storage.getCurrent(ctx.serverKey, tool.name);
    const drift = classifyDrift({
      oldFingerprint: prior?.fingerprint ?? null,
      newFingerprint: fp,
      oldDescription: prior?.description ?? '',
      newDescription: tool.description,
      oldInputSchema: prior?.inputSchema ?? '',
      newInputSchema: schema,
    });
    ctx.storage.upsertCurrent({
      serverUrl: ctx.serverKey,
      toolName: tool.name,
      fingerprint: fp,
      description: tool.description,
      inputSchema: schema,
      firstSeen: prior?.firstSeen ?? now,
      lastSeen: now,
    });
    ctx.storage.appendHistory({
      serverUrl: ctx.serverKey,
      toolName: tool.name,
      fingerprint: fp,
      canonicalPayload: canonicalJson({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }),
      observedAt: now,
    });

    if (drift.verdict === 'suspicious-injection') {
      ctx.storage.appendDriftEvent({
        serverUrl: ctx.serverKey,
        toolName: tool.name,
        oldFingerprint: prior?.fingerprint ?? '',
        newFingerprint: fp,
        detectedAt: now,
        diffSummary: drift.diffSummary,
      });
      const action: ProxyDecision['action'] = ctx.policy === 'block' ? 'blocked' : 'warned';
      ctx.onDecision?.({ toolName: tool.name, verdict: drift.verdict, reason: drift.reason, action });
      if (action === 'blocked') continue; // drop the poisoned tool
    }
    kept.push(tool);
  }
  return { ...body, result: { ...body.result, tools: kept } };
}

export interface ProxyHandle {
  close: () => Promise<void>;
  server: Server;
}

/** Start the inline proxy HTTP server. Agents point at this instead of upstream. */
export function startProxy(ctx: ProxyContext, port: number): ProxyHandle {
  const server = createServer((req, res) => {
    void (async () => {
      if (req.method !== 'POST') {
        res.writeHead(405).end();
        return;
      }
      let raw = '';
      req.on('data', (c) => (raw += c));
      await new Promise<void>((resolve) => req.on('end', () => resolve()));
      let msg: JsonRpc;
      try {
        msg = JSON.parse(raw);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid JSON' }));
        return;
      }
      try {
        const out = await forward(msg, ctx);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      } catch (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32000, message: err instanceof Error ? err.message : String(err) } }));
      }
    })();
  });
  server.listen(port);
  return {
    server,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
