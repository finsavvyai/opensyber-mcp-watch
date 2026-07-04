# @opensyber/mcp-watch-server

The **OpenSyber cloud layer** — a multi-tenant service that ingests MCP tool
fingerprints from many agents/machines and scores drift with the same
`@opensyber/mcp-watch-core` rules the CLI uses.

> **Status: backend complete (Phases 1–5).** Fastify HTTP API + a pluggable
> `Store` (in-memory for dev/tests, Postgres for production), hashed API keys,
> cross-machine fleet baselines, a tamper-evident HMAC audit log, and a read API.
> The remaining work is the dashboard UI + billing. Full design:
> [`docs/cloud-architecture.md`](../../docs/cloud-architecture.md).

## Run

```bash
pnpm --filter @opensyber/mcp-watch-server build

# in-memory (no database) — keys seeded from MCP_WATCH_API_KEYS as key:org pairs
PORT=8787 MCP_WATCH_API_KEYS="dev-key:demo-org" \
  pnpm --filter @opensyber/mcp-watch-server start

# with Postgres
psql "$DATABASE_URL" -f packages/server/migrations/0001_init.sql
DATABASE_URL="postgres://user:pw@host/db" pnpm --filter @opensyber/mcp-watch-server start
```

```bash
curl localhost:8787/healthz

curl -X POST localhost:8787/v1/ingest \
  -H 'Authorization: Bearer dev-key' -H 'Content-Type: application/json' \
  -d '{"agentId":"laptop-1","serverUrl":"http://localhost:3001/mcp","observedAt":0,
       "tools":[{"toolName":"search","fingerprint":"<local-hash>","description":"search the web","inputSchema":{}}]}'
```

## Endpoints

| Method | Path                | Auth           | Purpose                                             |
|--------|---------------------|----------------|-----------------------------------------------------|
| GET    | `/healthz`          | none           | Liveness probe.                                     |
| POST   | `/v1/ingest`        | `Bearer <key>` | Batch of tool observations → temporal + fleet verdicts. |
| GET    | `/v1/tools`         | `Bearer <key>` | Current tools the org is tracking.                  |
| GET    | `/v1/events`        | `Bearer <key>` | Recent drift + fleet events (`?limit=`).            |
| GET    | `/v1/audit/export`  | `Bearer <key>` | Hash-chained audit record + integrity check.        |

- **Auth-before-parse:** the API key is checked in an `onRequest` hook for every
  `/v1/*` route, so an unauthenticated request is `401`ed before its body is read.
- **Server-side fingerprints:** the server recomputes each fingerprint from the
  raw fields and treats *that* as authoritative; the agent's claimed hash is
  compared and any disagreement returned as `fingerprintMismatch: true`.
- **Fleet baselines:** each ingest checks the tool's fingerprint against the org's
  fleet consensus; a disagreeing agent yields `fleetDivergence` + a `fleet-divergence` event.
- **Audit log:** every detection appends a per-org HMAC-chained entry;
  `MCP_WATCH_AUDIT_SECRET` sets the server secret.

## Architecture

```
src/
  app.ts          buildApp(store) → Fastify instance (routes + auth hook)
  index.ts        entry: pick Store from env, listen
  config.ts       env parsing (PORT, DATABASE_URL, MCP_WATCH_API_KEYS)
  auth.ts         hashApiKey(), bearerToken()
  store/
    types.ts      Store interface + domain types
    memory.ts     MemoryStore (tests + dev)
    postgres.ts   PgStore (pg)
migrations/
  0001_init.sql   orgs, api_keys, agents, observations, current_fingerprints, drift_events
```

`buildApp(store)` takes any `Store`, so the HTTP + detection layers are tested
with `MemoryStore` via Fastify `inject()` — no port and no database. `PgStore` is
typecheck-verified; integration-test it against a live Postgres.

## Test

```bash
pnpm --filter @opensyber/mcp-watch-server test
```
