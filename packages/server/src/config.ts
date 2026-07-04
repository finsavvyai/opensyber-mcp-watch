export interface ServerConfig {
  port: number;
  /** When set, use Postgres; otherwise fall back to the in-memory store. */
  databaseUrl: string | null;
  /** Dev/seed keys, `key:org` pairs. Seeded into the memory store only. */
  apiKeys: Array<{ key: string; org: string }>;
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const apiKeys = (env.MCP_WATCH_API_KEYS ?? 'dev-key:demo-org')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(':');
      if (idx === -1) throw new Error(`Invalid MCP_WATCH_API_KEYS entry '${pair}', expected 'key:org'.`);
      return { key: pair.slice(0, idx), org: pair.slice(idx + 1) };
    });
  return {
    port: Number(env.PORT ?? 8787),
    databaseUrl: env.DATABASE_URL ?? null,
    apiKeys,
  };
}
