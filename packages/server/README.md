# @opensyber/mcp-watch-server

The **OpenSyber cloud layer** — a multi-tenant service that ingests MCP tool
fingerprints from many agents/machines and runs long-history, cross-machine,
and fleet-baseline analysis on top of the shared detection core.

> **Status: Phase 1 scaffold.** The current `src/index.ts` is a dependency-free
> `node:http` stub with an in-memory store. It exists to prove out the ingest
> contract and server-side reuse of `@opensyber/mcp-watch-core`. The full design
> — Postgres schema, auth, fleet baselines, signed audit log — lives in
> [`docs/cloud-architecture.md`](../../docs/cloud-architecture.md).

## Run the stub

```bash
pnpm --filter @opensyber/mcp-watch-server build
PORT=8787 MCP_WATCH_API_KEYS="dev-key:demo-org" pnpm --filter @opensyber/mcp-watch-server start

# health
curl localhost:8787/healthz

# ingest
curl -X POST localhost:8787/v1/ingest \
  -H 'Authorization: Bearer dev-key' \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"laptop-1","serverUrl":"http://localhost:3001/mcp","observedAt":0,
       "tools":[{"toolName":"search","fingerprint":"abc","description":"search the web","inputSchema":{}}]}'
```

## Endpoints (Phase 1)

| Method | Path         | Purpose                                             |
|--------|--------------|-----------------------------------------------------|
| GET    | `/healthz`   | Liveness probe.                                     |
| POST   | `/v1/ingest` | Accept a batch of tool observations from one agent. |

Auth is `Authorization: Bearer <api-key>`; keys map to an org id.
