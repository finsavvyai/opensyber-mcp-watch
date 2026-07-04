/**
 * OpenSyber cloud layer — ingest service entry point (Phase 1).
 *
 * Fastify HTTP + a pluggable Store. With DATABASE_URL set it uses Postgres
 * (see migrations/0001_init.sql); otherwise an in-memory store seeded from
 * MCP_WATCH_API_KEYS for local dev. Detection reuses @opensyber/mcp-watch-core,
 * so the cloud and the CLI score drift identically. See docs/cloud-architecture.md.
 */
import { buildApp } from './app.js';
import { loadServerConfig } from './config.js';
import { MemoryStore } from './store/memory.js';
import { PgStore } from './store/postgres.js';
import type { Store } from './store/types.js';

const cfg = loadServerConfig();
const store: Store = cfg.databaseUrl
  ? new PgStore(cfg.databaseUrl, cfg.auditSecret)
  : new MemoryStore(cfg.apiKeys, cfg.auditSecret);
const app = buildApp(store);

const backend = cfg.databaseUrl ? 'postgres' : 'memory';
app
  .listen({ port: cfg.port, host: '0.0.0.0' })
  .then((addr) => process.stdout.write(`mcp-watch-server (${backend}) listening on ${addr}\n`))
  .catch((err) => {
    process.stderr.write(`failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => store.close()).then(() => process.exit(0));
  });
}
