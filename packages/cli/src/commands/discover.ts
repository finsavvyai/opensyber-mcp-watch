import { existsSync, readFileSync } from 'node:fs';
import { discover, mergeServers } from '../discover.js';
import {
  saveConfig,
  defaultConfigPath,
  DEFAULT_INTERVAL_MS,
  type WatchConfig,
  type ServerConfig,
} from '../config.js';
import { c } from '../output.js';

export async function discoverCommand(args: string[] = []): Promise<number> {
  const write = args.includes('--write');
  const found = discover();
  if (found.length === 0) {
    process.stdout.write(c.dim('No MCP client configs found (Claude Desktop, Cursor, VS Code, Windsurf, Claude Code).\n'));
    return 0;
  }

  const all: ServerConfig[] = [];
  for (const f of found) {
    process.stdout.write(c.bold(f.source.client) + c.dim(` (${f.source.path})\n`));
    for (const s of f.servers) {
      const via = s.command ? `stdio: ${s.command} ${(s.args ?? []).join(' ')}`.trim() : s.url;
      process.stdout.write(`  • ${s.name} ${c.dim(`— ${via}`)}\n`);
      all.push(s);
    }
  }
  const discovered = mergeServers([], all);

  if (!write) {
    process.stdout.write(
      c.dim(`\n${discovered.length} server(s) found. Re-run 'discover --write' to add them to ${defaultConfigPath()}.\n`),
    );
    return 0;
  }

  const path = defaultConfigPath();
  let base: WatchConfig = {
    servers: [],
    interval_ms: DEFAULT_INTERVAL_MS,
    alert_on: ['description_change', 'schema_change', 'tool_added', 'tool_removed'],
  };
  if (existsSync(path)) {
    try {
      base = { ...base, ...(JSON.parse(readFileSync(path, 'utf8')) as Partial<WatchConfig>) } as WatchConfig;
    } catch {
      /* keep defaults if the existing config is unreadable */
    }
  }
  const servers = mergeServers(base.servers ?? [], discovered);
  saveConfig({ ...base, servers }, path);
  process.stdout.write(c.ok(`\n✓ Wrote ${servers.length} server(s) to ${path}\n`));
  return 0;
}
