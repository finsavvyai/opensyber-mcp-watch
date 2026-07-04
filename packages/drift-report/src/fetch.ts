import type { ToolDef } from '@opensyber/mcp-watch-core';

export interface FetchOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: typeof globalThis.fetch;
}

interface JsonRpcResponse {
  result?: { tools?: ToolDef[] };
  error?: { code: number; message: string };
}

/**
 * Parse an MCP HTTP response body, which may be plain JSON or a Streamable-HTTP
 * SSE frame (`event: message\ndata: {...}`). Returns the last JSON payload.
 */
export function parseMcpResponse(bodyText: string): unknown {
  const trimmed = bodyText.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed);
  const dataLines = bodyText
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter(Boolean);
  for (let i = dataLines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(dataLines[i]);
    } catch {
      /* keep scanning for a parseable data line */
    }
  }
  throw new Error('unparseable MCP response');
}

function extractTools(body: unknown): ToolDef[] {
  const rpc = body as JsonRpcResponse;
  if (rpc.error) throw new Error(`MCP error ${rpc.error.code}: ${rpc.error.message}`);
  const tools = rpc.result?.tools;
  if (!Array.isArray(tools)) throw new Error('no tools array in response');
  return tools;
}

async function post(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * MCP `tools/list` over Streamable HTTP. Tries the spec handshake
 * (initialize → notifications/initialized → tools/list, carrying any
 * Mcp-Session-Id), and falls back to a bare tools/list for simple servers.
 */
export async function fetchToolsList(url: string, opts: FetchOpts = {}): Promise<ToolDef[]> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const base = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(opts.headers ?? {}),
  };

  const init = await post(fetchImpl, url, base, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'mcp-watch-drift-report', version: '0.1.0' },
    },
  }, timeoutMs);

  if (init.ok) {
    const sessionId = init.headers.get('mcp-session-id');
    const withSession = sessionId ? { ...base, 'Mcp-Session-Id': sessionId } : base;
    try {
      await post(fetchImpl, url, withSession, { jsonrpc: '2.0', method: 'notifications/initialized' }, timeoutMs);
    } catch {
      /* notification is best-effort */
    }
    const list = await post(fetchImpl, url, withSession, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, timeoutMs);
    if (!list.ok) throw new Error(`HTTP ${list.status}`);
    return extractTools(parseMcpResponse(await list.text()));
  }

  // Fallback: some servers answer tools/list directly without a handshake.
  const list = await post(fetchImpl, url, base, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, timeoutMs);
  if (!list.ok) throw new Error(`HTTP ${list.status}`);
  return extractTools(parseMcpResponse(await list.text()));
}
