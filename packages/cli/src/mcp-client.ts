import type { ToolDef } from '@opensyber/mcp-watch-core';
import { toolToEntity, promptToEntity, resourceToEntity, type Entity } from './entities.js';

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

export interface FetchToolsOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** One JSON-RPC list call; returns the array under the method's namespace key. */
async function rpcList(serverUrl: string, method: string, opts: FetchToolsOpts): Promise<unknown[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`MCP server returned HTTP ${res.status} from ${serverUrl}`);
    const body = (await res.json()) as JsonRpcResponse;
    if (body.error) throw new Error(`MCP server error ${body.error.code}: ${body.error.message}`);
    const key = method.split('/')[0]; // tools | prompts | resources
    const arr = body.result?.[key];
    if (!Array.isArray(arr)) throw new Error(`MCP server returned no ${key} array from ${serverUrl}`);
    return arr;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchToolsList(serverUrl: string, opts: FetchToolsOpts = {}): Promise<ToolDef[]> {
  return (await rpcList(serverUrl, 'tools/list', opts)) as ToolDef[];
}

/** Tools (required) + prompts + resources (best-effort — unsupported lists are skipped). */
export async function fetchEntitiesHttp(serverUrl: string, opts: FetchToolsOpts = {}): Promise<Entity[]> {
  const tools = (await rpcList(serverUrl, 'tools/list', opts)) as ToolDef[];
  const prompts = await rpcList(serverUrl, 'prompts/list', opts).catch(() => [] as unknown[]);
  const resources = await rpcList(serverUrl, 'resources/list', opts).catch(() => [] as unknown[]);
  return [
    ...tools.map(toolToEntity),
    ...prompts.map((p) => promptToEntity(p as Record<string, unknown>)),
    ...resources.map((r) => resourceToEntity(r as Record<string, unknown>)),
  ];
}
