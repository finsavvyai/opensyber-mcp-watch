import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type AlertCondition =
  | 'description_change'
  | 'schema_change'
  | 'tool_added'
  | 'tool_removed';

export interface ServerConfig {
  url: string;
  name: string;
  headers?: Record<string, string>;
}

export interface WatchConfig {
  servers: ServerConfig[];
  interval_ms: number;
  alert_on: AlertCondition[];
}

export const DEFAULT_INTERVAL_MS = 300_000;

export function defaultConfigPath(): string {
  if (process.env.MCP_WATCH_CONFIG) return process.env.MCP_WATCH_CONFIG;
  return join(homedir(), '.opensyber', 'mcp-watch.config.json');
}

export function loadConfig(path: string = defaultConfigPath()): WatchConfig {
  if (!existsSync(path)) {
    throw new Error(
      `Config not found at ${path}. Run 'opensyber-mcp-watch init' to create one.`,
    );
  }
  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Config at ${path} is not valid JSON: ${msg}`);
  }
  const cfg = parsed as Partial<WatchConfig>;
  if (!Array.isArray(cfg.servers) || cfg.servers.length === 0) {
    throw new Error(`Config must include a non-empty 'servers' array.`);
  }
  for (const s of cfg.servers) {
    if (typeof s.url !== 'string' || !/^https?:\/\//.test(s.url)) {
      throw new Error(`Server config has invalid url: ${JSON.stringify(s)}`);
    }
    if (typeof s.name !== 'string' || s.name.length === 0) {
      throw new Error(`Server config missing 'name': ${JSON.stringify(s)}`);
    }
  }
  return {
    servers: cfg.servers,
    interval_ms: typeof cfg.interval_ms === 'number' ? cfg.interval_ms : DEFAULT_INTERVAL_MS,
    alert_on:
      Array.isArray(cfg.alert_on) && cfg.alert_on.length > 0
        ? (cfg.alert_on as AlertCondition[])
        : ['description_change', 'schema_change', 'tool_added', 'tool_removed'],
  };
}

export function saveConfig(cfg: WatchConfig, path: string = defaultConfigPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}
