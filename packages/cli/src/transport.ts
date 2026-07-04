import type { ToolDef } from '@opensyber/mcp-watch-core';
import type { ServerConfig } from './config.js';
import { fetchToolsList, fetchEntitiesHttp } from './mcp-client.js';
import { fetchToolsListStdio, fetchEntitiesStdio } from './stdio-client.js';
import type { Entity } from './entities.js';

export interface TransportOpts {
  timeoutMs?: number;
}

/** Fetch a server's tools over whichever transport it's configured for. */
export async function fetchTools(server: ServerConfig, opts: TransportOpts = {}): Promise<ToolDef[]> {
  if (server.command) return fetchToolsListStdio(server, opts);
  if (server.url) return fetchToolsList(server.url, { headers: server.headers, timeoutMs: opts.timeoutMs });
  throw new Error(`Server '${server.name}' has neither 'url' nor 'command'.`);
}

/** Fetch tools + prompts + resources over whichever transport the server uses. */
export async function fetchEntities(server: ServerConfig, opts: TransportOpts = {}): Promise<Entity[]> {
  if (server.command) return fetchEntitiesStdio(server, opts);
  if (server.url) return fetchEntitiesHttp(server.url, { headers: server.headers, timeoutMs: opts.timeoutMs });
  throw new Error(`Server '${server.name}' has neither 'url' nor 'command'.`);
}
