import type { ToolDef } from '@opensyber/mcp-watch-core';

interface JsonRpcResponse {
  result?: { tools?: ToolDef[] };
  error?: { code: number; message: string };
}

export interface FetchOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: typeof globalThis.fetch;
}

/** Minimal MCP `tools/list` over HTTP/JSON-RPC. Dependency-free on purpose. */
export async function fetchToolsList(url: string, opts: FetchOpts = {}): Promise<ToolDef[]> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as JsonRpcResponse;
    if (body.error) throw new Error(`MCP error ${body.error.code}: ${body.error.message}`);
    const tools = body.result?.tools;
    if (!Array.isArray(tools)) throw new Error('no tools array in response');
    return tools;
  } finally {
    clearTimeout(timer);
  }
}
