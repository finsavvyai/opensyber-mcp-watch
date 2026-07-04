import { spawn } from 'node:child_process';
import type { ToolDef } from '@opensyber/mcp-watch-core';
import type { ServerConfig } from './config.js';
import { toolToEntity, promptToEntity, resourceToEntity, type Entity } from './entities.js';

export interface StdioOpts {
  timeoutMs?: number;
}

interface RpcResult {
  tools?: unknown[];
  prompts?: unknown[];
  resources?: unknown[];
}

interface Pending {
  resolve: (result: RpcResult | undefined) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

const OPTIONAL_TIMEOUT_MS = 3000;

/**
 * Fetch tools (required) + prompts + resources (best-effort) from a spawned
 * stdio MCP server in a single session. Speaks newline-delimited JSON-RPC:
 * initialize → notifications/initialized → *_/list. Ignores non-JSON log lines,
 * tolerates servers that don't implement the optional lists, always kills child.
 */
export async function fetchEntitiesStdio(server: ServerConfig, opts: StdioOpts = {}): Promise<Entity[]> {
  if (!server.command) throw new Error(`stdio server '${server.name}' requires a 'command'.`);
  const totalTimeout = opts.timeoutMs ?? 15_000;
  const child = spawn(server.command, server.args ?? [], {
    env: { ...process.env, ...(server.env ?? {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pending = new Map<number, Pending>();
  let buf = '';
  let nextId = 1;
  let done = false;

  return new Promise<Entity[]>((resolve, reject) => {
    const cleanup = (): void => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    };
    const finish = (entities: Entity[]): void => {
      if (done) return;
      done = true;
      clearTimeout(master);
      cleanup();
      resolve(entities);
    };
    const fatal = (err: Error): void => {
      if (done) return;
      done = true;
      clearTimeout(master);
      for (const p of pending.values()) clearTimeout(p.timer);
      pending.clear();
      cleanup();
      reject(err);
    };

    const master = setTimeout(() => fatal(new Error(`stdio server '${server.name}' timed out after ${totalTimeout}ms`)), totalTimeout);

    child.on('error', (err) => fatal(err instanceof Error ? err : new Error(String(err))));
    child.on('exit', (code) => fatal(new Error(`stdio server '${server.name}' exited (code ${code}) before responding`)));

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg: { id?: number; result?: RpcResult; error?: { code: number; message: string } };
        try {
          msg = JSON.parse(line);
        } catch {
          continue; // server log line
        }
        if (typeof msg.id === 'number' && pending.has(msg.id)) {
          const p = pending.get(msg.id)!;
          pending.delete(msg.id);
          clearTimeout(p.timer);
          if (msg.error) p.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
          else p.resolve(msg.result);
        }
      }
    });

    const send = (obj: unknown): void => {
      try {
        child.stdin.write(JSON.stringify(obj) + '\n');
      } catch {
        /* stdin closed — the exit handler will surface it */
      }
    };
    const request = (method: string, ms: number, params?: unknown): Promise<RpcResult | undefined> =>
      new Promise((res, rej) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            rej(new Error(`${method} timed out`));
          }
        }, ms);
        pending.set(id, { resolve: res, reject: rej, timer });
        send({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
      });

    void (async () => {
      try {
        await request('initialize', totalTimeout, {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'opensyber-mcp-watch', version: '0.3.0' },
        });
        send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const toolsRes = await request('tools/list', totalTimeout);
        const tools = Array.isArray(toolsRes?.tools) ? toolsRes.tools : [];
        // Optional surfaces — tolerate unsupported/silent servers.
        const promptsRes = await request('prompts/list', OPTIONAL_TIMEOUT_MS).catch(() => undefined);
        const resourcesRes = await request('resources/list', OPTIONAL_TIMEOUT_MS).catch(() => undefined);
        const prompts = Array.isArray(promptsRes?.prompts) ? promptsRes.prompts : [];
        const resources = Array.isArray(resourcesRes?.resources) ? resourcesRes.resources : [];
        finish([
          ...tools.map((t) => toolToEntity(t as ToolDef)),
          ...prompts.map((p) => promptToEntity(p as Record<string, unknown>)),
          ...resources.map((r) => resourceToEntity(r as Record<string, unknown>)),
        ]);
      } catch (err) {
        fatal(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  });
}

/** Tools-only convenience over a stdio server. */
export async function fetchToolsListStdio(server: ServerConfig, opts: StdioOpts = {}): Promise<ToolDef[]> {
  const entities = await fetchEntitiesStdio(server, opts);
  return entities.filter((e) => e.kind === 'tool').map((e) => e.value as ToolDef);
}
