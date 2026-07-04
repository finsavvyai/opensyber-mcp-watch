# OpenSyber mcp-watch — Cloud Layer Architecture

> Status: **design + Phases 0–1 landed.** This document specifies how `mcp-watch`
> grows from a single-machine CLI into a hosted, multi-tenant security layer.
> Phase 0 (monorepo + shared `core`) and Phase 1 (Fastify ingest API + Store
> abstraction + Postgres schema) are implemented; Phases 2–5 are the plan.

## 1. Why a cloud layer

The local CLI (`@opensyber/mcp-watch`) is deliberately scoped to **one machine, 7
days of history, no network egress** — see `CONTRIBUTING.md` ("what we don't
want"). That scope is a feature: the local tool stays small, auditable, and
dependency-light.

But several detections are *impossible* from a single machine:

- **A targeted rug-pull** serves the malicious tool definition to **one** agent
  (one user, one IP, one session) while every other agent still sees the clean
  one. A single machine has nothing to compare against; a fleet does.
- **Slow drift** over weeks falls outside the 7-day local window.
- **Compliance** needs a tamper-evident, exportable record that outlives a laptop.

The cloud layer adds exactly the four capabilities the CLI intentionally omits:

| Capability             | Why it needs the server                                              |
|------------------------|----------------------------------------------------------------------|
| Multi-week history     | Unbounded retention in a real database, not a 7-day local prune.     |
| Cross-machine sync     | Aggregate the same `(server, tool)` across every agent in an org.    |
| Behavioral baselines   | A *fleet consensus* fingerprint; flag the agent that disagrees.      |
| Audit logs             | Append-only, HMAC-signed, exportable for regulators.                 |

## 2. The load-bearing decision: one shared `core`

The detection rules (canonical fingerprinting + drift classification) must be
**identical** on the agent and the server. If they diverged, the cloud could
"clear" drift the CLI flagged, or vice-versa — a trust disaster for a security
product.

So the rules live in one dependency-free, I/O-free package consumed by both:

```
@opensyber/mcp-watch-core
  fingerprintTool()   SHA-256 of canonical { name, description, inputSchema }
  canonicalize()      deterministic key ordering
  classifyDrift()     unchanged | first-seen | version-bump | suspicious-injection
```

This package has **no network and no storage code on purpose** — it is the one
thing both edges agree on. Everything else (transport, persistence,
multi-tenancy) is layered around it.

## 3. Monorepo layout (Phase 0 — implemented)

```
opensyber-mcp-watch/                 pnpm workspace root
├─ tsconfig.base.json                shared strict compiler options
├─ pnpm-workspace.yaml
├─ packages/
│  ├─ core/      @opensyber/mcp-watch-core    fingerprint + differ (no deps, no I/O)
│  ├─ cli/       @opensyber/mcp-watch         the existing local watcher (+ better-sqlite3, kleur)
│  └─ server/    @opensyber/mcp-watch-server  the cloud layer (Phase 1+)
└─ docs/cloud-architecture.md
```

- `cli` and `server` both depend on `core` as a `workspace:*` dev dependency and
  **bundle it at build time** (tsup `esbuildOptions.alias` → core source). The
  published CLI therefore has no unresolved workspace dependency, and builds need
  no cross-package ordering.
- `core` ships as its own public npm package so external tools can score drift
  with the same rules.

Verification today: `pnpm typecheck`, `pnpm test` (core 16 + cli 5), and
`pnpm build` all pass from the workspace root.

## 4. Target topology

```
   many machines / many agents (one org)
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ CLI agent│ │ CLI agent│ │ CLI agent│     @opensyber/mcp-watch  (Phase 2: remote sink)
   └────┬─────┘ └────┬─────┘ └────┬─────┘
        └────────────┼────────────┘   HTTPS + Bearer API key, batched
                     ▼
            ┌────────────────────────┐
            │  Ingest API (Fastify)  │   @opensyber/mcp-watch-server
            ├────────────────────────┤
            │  core.classifyDrift()  │   ← same rules as the agent
            │  Postgres (no prune)   │   ← unbounded, org-scoped history
            │  Fleet aggregator      │   ← consensus + outlier detection
            │  Append-only audit log │   ← HMAC-signed, exportable
            └───────────┬────────────┘
                        ▼
              Dashboard · Auth · Billing   (Phase 5)
```

## 5. Data model (Phase 1, Postgres)

Mirrors the CLI's three SQLite tables (`packages/cli/src/storage.ts`) but adds
tenancy (`org_id`), provenance (`agent_id`), and drops the 7-day prune.

```sql
CREATE TABLE orgs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES orgs(id),
  hash         text NOT NULL,            -- sha-256 of the key; raw key shown once
  label        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz
);

CREATE TABLE agents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES orgs(id),
  external_id  text NOT NULL,            -- agentId supplied by the CLI (hostname, etc.)
  last_seen    timestamptz,
  UNIQUE (org_id, external_id)
);

-- Full, unbounded observation history (partition by month).
CREATE TABLE observations (
  id           bigserial PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES orgs(id),
  agent_id     uuid NOT NULL REFERENCES agents(id),
  server_url   text NOT NULL,
  tool_name    text NOT NULL,
  fingerprint  text NOT NULL,
  canonical    jsonb NOT NULL,           -- { name, description, inputSchema }
  observed_at  timestamptz NOT NULL
) PARTITION BY RANGE (observed_at);
CREATE INDEX ON observations (org_id, server_url, tool_name, observed_at DESC);

-- Drift verdicts emitted by core.classifyDrift(), org-scoped.
CREATE TABLE drift_events (
  id           bigserial PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES orgs(id),
  agent_id     uuid NOT NULL REFERENCES agents(id),
  server_url   text NOT NULL,
  tool_name    text NOT NULL,
  verdict      text NOT NULL,
  old_fp       text,
  new_fp       text NOT NULL,
  diff_summary text,
  detected_at  timestamptz NOT NULL DEFAULT now()
);

-- Append-only, hash-chained audit log (section 8).
CREATE TABLE audit_log (
  seq          bigserial PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES orgs(id),
  prev_hmac    text NOT NULL,
  payload      jsonb NOT NULL,
  hmac         text NOT NULL,            -- HMAC-SHA256(prev_hmac || payload, org_secret)
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

## 6. Ingest API contract (Phase 1)

Auth: `Authorization: Bearer <api-key>`; the key hash maps to an `org_id`.
The scaffold in `packages/server/src/index.ts` already implements this shape
(in memory) so the contract can be exercised today.

```
POST /v1/ingest
{
  "agentId":   "laptop-1",
  "serverUrl": "http://localhost:3001/mcp",
  "observedAt": 1733740800000,
  "tools": [
    { "toolName": "search", "fingerprint": "<sha256>", "description": "...", "inputSchema": { } }
  ]
}
→ 200
{
  "org": "demo-org",
  "accepted": 1,
  "suspicious": 0,
  "verdicts": [ { "toolName": "search", "verdict": "first-seen", "reason": "...", "diffSummary": "..." } ]
}
```

Notes:
- Auth is an `onRequest` hook (**auth-before-parse**): an unauthenticated call
  gets `401` before its body is read, never a `415`.
- The server **recomputes** the fingerprint from the raw fields via
  `core.fingerprintTool()` and uses *that* as authoritative — the agent's hash is
  never trusted. A disagreement is returned as `fingerprintMismatch: true`
  (tampered or buggy agent).
- Batched: one request carries all tools from one server scan.
- Idempotent on `(org, agent, server, tool, fingerprint, observed_at)`.

Implemented in `packages/server` behind a `Store` interface
(`resolveOrg` / `getLastSeen` / `saveObservation` / `saveDriftEvent`) with two
backends: `MemoryStore` (tests + `DATABASE_URL`-less dev) and `PgStore`
(Postgres, schema in `migrations/0001_init.sql`).

## 7. Fleet baselines & cross-machine sync (Phase 3)

The key insight: within an org, the **same** `(server_url, tool_name)` should
present the **same** fingerprint to every agent at a given time. Divergence is
the signal.

Algorithm, per `(org, server_url, tool_name)` over a sliding window:

1. Group the latest observation from each agent.
2. Compute the **consensus** fingerprint = the mode (most agents agree).
3. Any agent whose latest fingerprint ≠ consensus is an **outlier** → raise a
   `fleet-divergence` event naming the disagreeing agent(s).
4. Feed both fingerprints through `core.classifyDrift()` so an outlier that also
   carries an injection marker escalates to `suspicious-injection`.

This is what catches the *targeted* rug-pull that single-machine watching cannot:
the attack hits one agent, the other N still see clean, the disagreement fires.

## 8. Audit log (Phase 4)

A tamper-evident, append-only chain so an org can prove what was observed and
when, even to a regulator:

- Each entry stores `hmac = HMAC-SHA256(prev_hmac ‖ canonical(payload), org_secret)`.
- Any edit/deletion breaks the chain; verification walks the chain and
  recomputes.
- **Export pack:** a signed bundle (events + chain + public verification
  instructions) downloadable per org per time range. This is the roadmap's
  "HMAC-signed audit pack."

## 9. Stack

TypeScript end-to-end so `core` is reused verbatim — no second implementation of
the rules in another language.

| Concern        | Choice                          | Rationale                                  |
|----------------|---------------------------------|--------------------------------------------|
| API framework  | **Fastify** (implemented)       | Fast, typed, small; `inject()` tests need no port. |
| DB             | Postgres via `pg` + raw SQL     | Explicit migration (`0001_init.sql`); Drizzle can layer on later. |
| Deploy         | Container or serverless         | Stateless API; DB is the only state.       |
| Auth (app)     | Org/team model, hashed API keys | Keys for agents; sessions for the dashboard.|
| Dashboard      | (Phase 5) React/Next            | Reuses the same JSON the API emits.         |

## 10. Phasing

| Phase | Scope                                                                 | Status      |
|-------|-----------------------------------------------------------------------|-------------|
| **0** | Monorepo; extract `core`; CLI + server bundle it; CI green            | **Done**    |
| **1** | Fastify ingest API + `Store` (Memory+Pg) + schema + hashed API keys   | **Done**    |
| **2** | CLI remote sink: `--cloud` config pushes observations; SQLite = cache | Planned     |
| **3** | Fleet aggregator: consensus fingerprints + outlier (`fleet-divergence`)| Planned    |
| **4** | Append-only HMAC audit log + signed export pack                        | Planned     |
| **5** | Dashboard, org/team management, billing                                | Planned     |

Each phase ships independently and leaves `main` releasable.

## 11. Non-goals (stay in the cloud layer, never in the CLI)

To honor the CLI's stated scope, none of the following ever land in
`packages/cli`; they live only in `packages/server`:

- Cross-machine sync, multi-week history, behavioral baselines, hosted audit logs.
- Any outbound network egress is **opt-in** on the CLI (Phase 2 `--cloud`), off by
  default. The local tool keeps working with zero cloud dependency.
