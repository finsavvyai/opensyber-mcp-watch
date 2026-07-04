import { spawn } from 'node:child_process';
import type { ToolDef } from '@opensyber/mcp-watch-core';
import type { ServerConfig } from './config.js';

export interface StdioOpts {
  timeoutMs?: number;
}

interface Pending {
  resolve: (result: { tools?: ToolDef[] } | undefined) => void;
  reject: (err: Error) => void;
}

/**
 * MCP `tools/list` over a spawned stdio server. Speaks newline-delimited
 * JSON-RPC: initialize → notifications/initialized → tools/list. Non-JSON lines
 * (server logs on stdout) are ignored. Always kills the child before resolving.
 */
export async function fetchToolsListStdio(server: ServerConfig, opts: StdioOpts = {}): Promise<ToolDef[]> {
  if (!server.command) throw new Error(`stdio server '${server.name}' requires a 'command'.`);
  const timeoutMs = opts.timeoutMs ?? 15_000;

  const child = spawn(server.command, server.args ?? [], {
    env: { ...process.env, ...(server.env ?? {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pending = new Map<number, Pending>();
  let buf = '';
  let nextId = 1;
  let settled = false;

  return new Promise<ToolDef[]>((resolve, reject) => {
    const kill = (): void => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    };
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      kill();
      reject(err);
    };
    const succeed = (tools: ToolDef[]): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      kill();
      resolve(tools);
    };

    const timer = setTimeout(() => fail(new Error(`stdio server '${server.name}' timed out after ${timeoutMs}ms`)), timeoutMs);

    child.on('error', (err) => fail(err instanceof Error ? err : new Error(String(err))));
    child.on('exit', (code) => fail(new Error(`stdio server '${server.name}' exited (code ${code}) before responding`)));

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg: { id?: number; result?: { tools?: ToolDef[] }; error?: { code: number; message: string } };
        try {
          msg = JSON.parse(line);
        } catch {
          continue; // server log line, not a JSON-RPC message
        }
        if (typeof msg.id === 'number' && pending.has(msg.id)) {
          const p = pending.get(msg.id)!;
          pending.delete(msg.id);
          if (msg.error) p.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
          else p.resolve(msg.result);
        }
      }
    });

    const send = (obj: unknown): void => {
      child.stdin.write(JSON.stringify(obj) + '\n');
    };
    const request = (method: string, params?: unknown): Promise<{ tools?: ToolDef[] } | undefined> =>
      new Promise((res, rej) => {
        const id = nextId++;
        pending.set(id, { resolve: res, reject: rej });
        send({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
      });

    void (async () => {
      try {
        await request('initialize', {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'opensyber-mcp-watch', version: '0.2.0' },
        });
        send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const result = await request('tools/list');
        const tools = result?.tools;
        if (!Array.isArray(tools)) throw new Error(`stdio server '${server.name}' returned no tools array`);
        succeed(tools);
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  });
}
