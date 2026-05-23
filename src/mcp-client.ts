import type { ToolDef } from './fingerprint.js';

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: { tools?: ToolDef[] };
  error?: { code: number; message: string };
}

export interface FetchToolsOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export async function fetchToolsList(serverUrl: string, opts: FetchToolsOpts = {}): Promise<ToolDef[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`MCP server returned HTTP ${res.status} from ${serverUrl}`);
    const body = (await res.json()) as JsonRpcResponse;
    if (body.error) throw new Error(`MCP server error ${body.error.code}: ${body.error.message}`);
    const tools = body.result?.tools;
    if (!Array.isArray(tools)) throw new Error(`MCP server returned no tools array from ${serverUrl}`);
    return tools;
  } finally {
    clearTimeout(timer);
  }
}
