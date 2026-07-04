# CI gating, JSON output & webhook alerts

## `scan --json` (SIEM / CI)

`opensyber-mcp-watch scan --json` prints a machine-readable report and exits:

- **0** — clean
- **2** — a `suspicious-injection` change was detected
- **1** — error · **64** — usage

```json
{
  "tool": "opensyber-mcp-watch",
  "generatedAt": 1751640000000,
  "summary": { "servers": 2, "suspicious": 1, "versionBump": 0, "firstSeen": 0, "unchanged": 3, "errors": 0 },
  "servers": [
    { "name": "prod", "server": "http://localhost:3001/mcp", "error": null,
      "tools": [ { "tool": "weather", "verdict": "suspicious-injection", "reason": "…", "oldFingerprint": "…", "newFingerprint": "…", "diff": "…" } ] }
  ]
}
```

Pipe it to your SIEM, or gate a pipeline on the exit code.

## GitHub Action

A composite action ships at the repo root (`action.yml`). Add a workflow like:

```yaml
# .github/workflows/mcp-watch.yml
name: MCP drift check
on: [push, schedule]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: finsavvyai/opensyber-mcp-watch@v0   # this repo's composite action
        with:
          config: .opensyber/mcp-watch.config.json
```

The step fails (exit 2) when a suspicious change is found, so a poisoned MCP
server breaks the build.

## Webhook alerts (watch)

Add webhooks to the config, or set `MCP_WATCH_WEBHOOK_URL` for a generic one.
During `watch`, suspicious + version-bump alerts are POSTed as they happen.

```json
{
  "servers": [ { "name": "prod", "url": "http://localhost:3001/mcp" } ],
  "webhooks": [
    { "url": "https://hooks.slack.com/services/…", "type": "slack" },
    { "url": "https://discord.com/api/webhooks/…", "type": "discord" },
    { "url": "https://siem.example/ingest", "type": "generic" }
  ]
}
```

- **slack** → `{ "text": "…" }` · **discord** → `{ "content": "…" }` · **generic** → `{ "source", "count", "alerts": [...] }`
- Delivery is best-effort: a webhook outage never breaks the watch loop.
