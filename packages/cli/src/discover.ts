import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import type { ServerConfig } from './config.js';

export interface DiscoverySource {
  client: string;
  path: string;
}

export interface DiscoverEnv {
  env?: NodeJS.ProcessEnv;
  home?: string;
  cwd?: string;
  platform?: NodeJS.Platform;
}

/** Well-known MCP client config locations across Claude Desktop, Cursor, VS Code, etc. */
export function candidatePaths(opts: DiscoverEnv = {}): DiscoverySource[] {
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const platform = opts.platform ?? process.platform;

  const sources: DiscoverySource[] = [];
  if (platform === 'darwin') {
    sources.push({ client: 'Claude Desktop', path: join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json') });
  } else if (platform === 'win32' && env.APPDATA) {
    sources.push({ client: 'Claude Desktop', path: join(env.APPDATA, 'Claude', 'claude_desktop_config.json') });
  } else {
    sources.push({ client: 'Claude Desktop', path: join(home, '.config', 'Claude', 'claude_desktop_config.json') });
  }
  sources.push({ client: 'Cursor', path: join(home, '.cursor', 'mcp.json') });
  sources.push({ client: 'Cursor (project)', path: join(cwd, '.cursor', 'mcp.json') });
  sources.push({ client: 'Windsurf', path: join(home, '.codeium', 'windsurf', 'mcp_config.json') });
  sources.push({ client: 'VS Code (project)', path: join(cwd, '.vscode', 'mcp.json') });
  sources.push({ client: 'Claude Code (project)', path: join(cwd, '.mcp.json') });
  return sources;
}

/** Parse a client config's server map into mcp-watch ServerConfigs. Supports the
 *  `mcpServers` key (Claude/Cursor/Windsurf) and `servers` (VS Code). */
export function parseClientConfig(raw: unknown): ServerConfig[] {
  const obj = raw as Record<string, unknown> | null;
  if (!obj || typeof obj !== 'object') return [];
  const map = (obj.mcpServers ?? obj.servers) as Record<string, unknown> | undefined;
  if (!map || typeof map !== 'object') return [];

  const servers: ServerConfig[] = [];
  for (const [name, def] of Object.entries(map)) {
    const d = def as Record<string, unknown>;
    if (typeof d.url === 'string') {
      servers.push({ name, url: d.url, ...(d.headers ? { headers: d.headers as Record<string, string> } : {}) });
    } else if (typeof d.command === 'string') {
      servers.push({
        name,
        command: d.command,
        args: Array.isArray(d.args) ? d.args.map(String) : [],
        ...(d.env ? { env: d.env as Record<string, string> } : {}),
      });
    }
  }
  return servers;
}

export interface Discovered {
  source: DiscoverySource;
  servers: ServerConfig[];
}

/** Read every existing client config and return the servers found in each. */
export function discover(sources: DiscoverySource[] = candidatePaths()): Discovered[] {
  const found: Discovered[] = [];
  for (const source of sources) {
    if (!existsSync(source.path)) continue;
    try {
      const servers = parseClientConfig(JSON.parse(readFileSync(source.path, 'utf8')));
      if (servers.length > 0) found.push({ source, servers });
    } catch {
      /* unreadable or invalid JSON — skip */
    }
  }
  return found;
}

/** Merge discovered servers into an existing list, de-duplicated by name. */
export function mergeServers(existing: ServerConfig[], discovered: ServerConfig[]): ServerConfig[] {
  const byName = new Map<string, ServerConfig>();
  for (const s of existing) byName.set(s.name, s);
  for (const s of discovered) if (!byName.has(s.name)) byName.set(s.name, s);
  return [...byName.values()];
}
