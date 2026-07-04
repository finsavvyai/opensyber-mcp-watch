import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type AlertCondition =
  | 'description_change'
  | 'schema_change'
  | 'tool_added'
  | 'tool_removed';

export interface ServerConfig {
  name: string;
  /** HTTP transport: the MCP endpoint URL. */
  url?: string;
  headers?: Record<string, string>;
  /** stdio transport: the command to spawn (mutually exclusive with url). */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Stable identity for a server across transports (used as the storage key). */
export function serverKey(s: ServerConfig): string {
  if (s.url) return s.url;
  if (s.command) return `stdio:${[s.command, ...(s.args ?? [])].join(' ')}`;
  return `server:${s.name}`;
}

/** Opt-in push to the OpenSyber cloud layer. Off unless explicitly enabled. */
export interface CloudConfig {
  endpoint: string;
  api_key: string;
  enabled: boolean;
}

export interface WebhookConfig {
  url: string;
  type?: 'slack' | 'discord' | 'generic';
}

export interface WatchConfig {
  servers: ServerConfig[];
  interval_ms: number;
  alert_on: AlertCondition[];
  cloud?: CloudConfig;
  webhooks?: WebhookConfig[];
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
    if (typeof s.name !== 'string' || s.name.length === 0) {
      throw new Error(`Server config missing 'name': ${JSON.stringify(s)}`);
    }
    const hasCommand = typeof s.command === 'string' && s.command.length > 0;
    const hasUrl = typeof s.url === 'string' && s.url.length > 0;
    if (!hasCommand && !hasUrl) {
      throw new Error(`Server '${s.name}' needs either a 'url' (http) or a 'command' (stdio).`);
    }
    if (hasUrl && !/^https?:\/\//.test(s.url as string)) {
      throw new Error(`Server '${s.name}' has invalid url: ${JSON.stringify(s.url)}`);
    }
  }
  let cloud: CloudConfig | undefined;
  if (cfg.cloud !== undefined) {
    const raw = cfg.cloud as Partial<CloudConfig>;
    if (typeof raw.endpoint !== 'string' || !/^https?:\/\//.test(raw.endpoint)) {
      throw new Error(`Cloud config has invalid endpoint: ${JSON.stringify(raw.endpoint)}`);
    }
    if (typeof raw.api_key !== 'string' || raw.api_key.length === 0) {
      throw new Error(`Cloud config missing 'api_key'.`);
    }
    cloud = { endpoint: raw.endpoint, api_key: raw.api_key, enabled: raw.enabled === true };
  }
  let webhooks: WebhookConfig[] | undefined;
  if (cfg.webhooks !== undefined) {
    if (!Array.isArray(cfg.webhooks)) throw new Error(`Config 'webhooks' must be an array.`);
    webhooks = cfg.webhooks.map((w) => {
      const wh = w as Partial<WebhookConfig>;
      if (typeof wh.url !== 'string' || !/^https?:\/\//.test(wh.url)) {
        throw new Error(`Webhook has invalid url: ${JSON.stringify(wh.url)}`);
      }
      return { url: wh.url, type: wh.type ?? 'generic' };
    });
  }
  return {
    servers: cfg.servers,
    interval_ms: typeof cfg.interval_ms === 'number' ? cfg.interval_ms : DEFAULT_INTERVAL_MS,
    alert_on:
      Array.isArray(cfg.alert_on) && cfg.alert_on.length > 0
        ? (cfg.alert_on as AlertCondition[])
        : ['description_change', 'schema_change', 'tool_added', 'tool_removed'],
    ...(cloud ? { cloud } : {}),
    ...(webhooks && webhooks.length > 0 ? { webhooks } : {}),
  };
}

/** Effective webhooks: config list plus an optional MCP_WATCH_WEBHOOK_URL (generic). */
export function resolveWebhooks(cfg: WatchConfig, env: NodeJS.ProcessEnv = process.env): WebhookConfig[] {
  const hooks = [...(cfg.webhooks ?? [])];
  if (env.MCP_WATCH_WEBHOOK_URL) hooks.push({ url: env.MCP_WATCH_WEBHOOK_URL, type: 'generic' });
  return hooks;
}

/**
 * Resolve the effective cloud target, merging env overrides over config.
 * Returns null when cloud push is not enabled (the default). Env vars
 * MCP_WATCH_CLOUD_ENDPOINT + MCP_WATCH_CLOUD_KEY are an explicit opt-in.
 */
export function resolveCloud(
  cfg: WatchConfig,
  env: NodeJS.ProcessEnv = process.env,
): CloudConfig | null {
  const endpoint = env.MCP_WATCH_CLOUD_ENDPOINT ?? cfg.cloud?.endpoint;
  const apiKey = env.MCP_WATCH_CLOUD_KEY ?? cfg.cloud?.api_key;
  if (!endpoint || !apiKey) return null;
  if (!/^https?:\/\//.test(endpoint)) {
    throw new Error(`Cloud endpoint must be http(s): ${endpoint}`);
  }
  const enabled = env.MCP_WATCH_CLOUD_ENDPOINT !== undefined ? true : cfg.cloud?.enabled === true;
  return enabled ? { endpoint, api_key: apiKey, enabled: true } : null;
}

export function saveConfig(cfg: WatchConfig, path: string = defaultConfigPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}
