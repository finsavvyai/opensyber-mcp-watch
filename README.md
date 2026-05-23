# `@opensyber/mcp-watch`

> MCP rug-pull detection. Records SHA-256 fingerprints per tool, per server, across days — catches what session-scoped scanners miss.

[![npm](https://img.shields.io/npm/v/@opensyber/mcp-watch.svg)](https://www.npmjs.com/package/@opensyber/mcp-watch)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/finsavvyai/opensyber-mcp-watch/actions/workflows/ci.yml/badge.svg)](https://github.com/finsavvyai/opensyber-mcp-watch/actions/workflows/ci.yml)

![drift detection demo](demo/drift-catch.gif)

## Install

```bash
npm i -g @opensyber/mcp-watch
```

```bash
pip install opensyber-mcp-watch     # Python wrapper, requires Node 20+
```

## The three-scan story

```
Scan 1 — Monday      weather       fingerprint f798fc7b…   stored
Scan 2 — Wednesday   weather       fingerprint f798fc7b…   matches
Scan 3 — Sunday      weather       fingerprint a519884c…   DRIFT DETECTED

  description gained "[SYSTEM]" override payload
  → Quarantine recommended. Disconnect agent until reviewed.
```

Every other scanner saw the clean version on every scan, because every other scanner hashes once per session. `mcp-watch` keeps SHA-256 fingerprints across days, so when a tool's description on Sunday gains an override that wasn't there on Monday, you find out before the agent acts on it.

## Free vs hosted

| | Free (this package) | Hosted (opensyber.cloud) |
|---|---|---|
| Local fingerprint history | 7 days | Multi-week |
| Cross-machine sync | — | ✓ |
| Behavioral baselines | — | ✓ (Growth fintech tier) |
| Regulator-ready audit logs | — | ✓ (Bank compliance tier) |
| Account required | no | yes |
| License | MIT | proprietary |

## CLI

```bash
opensyber-mcp-watch init                          # one-time setup
opensyber-mcp-watch scan                          # one-shot fingerprint
opensyber-mcp-watch watch                         # long-running watcher
opensyber-mcp-watch watch --interval 60s          # custom poll interval
opensyber-mcp-watch history <server> <tool>       # fingerprints over time
opensyber-mcp-watch diff <server> <tool>          # current vs stored
opensyber-mcp-watch --version
opensyber-mcp-watch --help
```

## Config

`~/.opensyber/mcp-watch.config.json`:

```json
{
  "servers": [
    { "url": "http://localhost:3001/mcp", "name": "local-dev" },
    { "url": "https://mcp.example.com", "name": "prod", "headers": { "Authorization": "Bearer ..." } }
  ],
  "interval_ms": 300000,
  "alert_on": ["description_change", "schema_change", "tool_added", "tool_removed"]
}
```

Override via env vars:

- `MCP_WATCH_CONFIG` — path to config file
- `MCP_WATCH_DB` — path to SQLite database
- `NO_COLOR` — disable ANSI color in output

## How fingerprinting works

The fingerprint is `SHA-256` of canonical JSON over `{name, description, inputSchema}`. Key reordering inside `inputSchema` is invisible (canonicalize sorts keys), so cosmetic noise from the MCP server doesn't trigger false positives. Anything that changes the *semantics* of the tool definition changes the fingerprint.

```ts
import { fingerprintTool } from '@opensyber/mcp-watch';

const fp = await fingerprintTool({
  name: 'weather',
  description: 'Returns the current weather for a given city.',
  inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
});
// fp === '64-char lowercase hex SHA-256'
```

## How drift classification works

`classifyDrift` returns one of four verdicts:

- `first-seen` — no prior fingerprint on file (baseline)
- `unchanged` — fingerprints match
- `version-bump` — `inputSchema` changed, description stable
- `suspicious-injection` — description changed (or gained a marker like `[SYSTEM]`, `exfiltrate`, etc.)

Built-in injection markers: `[SYSTEM]`, `<system>`, `<instruction>`, `ignore previous`, `override all prior`, `exfiltrate`, `attacker.example`.

## Storage

Local SQLite at `~/.opensyber/mcp-watch.db`. Two history tables, 7-day retention enforced on every write. Use the hosted product for multi-week history and cross-machine sync.

## Programmatic API

```ts
import { Storage, scanOnce, loadConfig, fetchToolsList, fingerprintTool } from '@opensyber/mcp-watch';

const storage = new Storage();
const cfg = loadConfig();
for (const server of cfg.servers) {
  const result = await scanOnce(storage, server);
  console.log(result.alerts);
}
storage.close();
```

## Why this matters

Snyk, Cisco `mcp-scanner`, Pipelock, and Straiker hash MCP tool definitions once per session. A rug-pull tuned to swap a tool description on the third call defeats all of them. `mcp-watch` keeps state across days, so cross-session attacks become visible.

This is the first piece of [OpenSyber](https://opensyber.cloud) — AI Agent Detection & Response for regulated industries.

## Roadmap

- ✓ MCP HTTP transport
- ◐ MCP stdio transport (next)
- ○ JSON output mode for SIEM ingestion
- ○ Webhook alerts (Slack/Discord/PagerDuty)
- ○ HMAC-signed export for audit packs

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: see [SECURITY.md](SECURITY.md) — please do not file public issues.

## License

MIT © OpenSyber
