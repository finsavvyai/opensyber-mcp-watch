-- OpenSyber mcp-watch cloud layer — Phase 1 schema.
-- Mirrors the CLI's SQLite tables but adds tenancy (org_id), provenance
-- (agent_id), and drops the 7-day prune. See docs/cloud-architecture.md.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS orgs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  hash        text NOT NULL UNIQUE,       -- sha-256 of the key; raw key shown once
  label       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

CREATE TABLE IF NOT EXISTS agents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  external_id  text NOT NULL,             -- agentId from the CLI (hostname, etc.)
  last_seen    timestamptz,
  UNIQUE (org_id, external_id)
);

-- Full, unbounded observation history. Production partitions by month on
-- observed_at; kept as a plain table here for a runnable baseline.
CREATE TABLE IF NOT EXISTS observations (
  id           bigserial PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_id     uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  server_url   text NOT NULL,
  tool_name    text NOT NULL,
  fingerprint  text NOT NULL,
  canonical    jsonb NOT NULL,            -- { name, description, inputSchema }
  observed_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_observations_lookup
  ON observations (org_id, server_url, tool_name, observed_at DESC);

-- Current fingerprint per (org, server, tool) — powers getLastSeen().
CREATE TABLE IF NOT EXISTS current_fingerprints (
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  server_url   text NOT NULL,
  tool_name    text NOT NULL,
  fingerprint  text NOT NULL,
  description  text NOT NULL,
  input_schema text NOT NULL,             -- canonical JSON
  updated_at   timestamptz NOT NULL,
  PRIMARY KEY (org_id, server_url, tool_name)
);

CREATE TABLE IF NOT EXISTS drift_events (
  id           bigserial PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_id     uuid REFERENCES agents(id) ON DELETE SET NULL,
  server_url   text NOT NULL,
  tool_name    text NOT NULL,
  verdict      text NOT NULL,
  old_fp       text,
  new_fp       text NOT NULL,
  diff_summary text,
  detected_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drift_events_lookup
  ON drift_events (org_id, server_url, tool_name, detected_at DESC);
