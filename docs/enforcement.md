# Inline enforcement proxy

`scan`/`watch` are *out-of-band* — they alert after the fact. The **proxy** sits
*in the data path* and can **block a poisoned tool in real time**, before the
agent ever sees it.

```
agent ──▶ mcp-watch proxy ──▶ upstream MCP server
                │
                ├─ fingerprint + classifyDrift (inline)
                └─ policy: block | warn | log
```

## Run

```bash
opensyber-mcp-watch proxy --server prod --port 8900 --policy block
```

Then point your MCP client at `http://localhost:8900` instead of the real
server URL. Everything is forwarded unchanged **except** `tools/list`, whose
tools are fingerprinted against the stored baseline.

## Policies

| Policy  | On a `suspicious-injection` tool                                  |
|---------|-------------------------------------------------------------------|
| `block` | **Removed** from the `tools/list` response — the agent never sees it. |
| `warn`  | Forwarded unchanged, but logged as `[WARN]` and recorded.         |
| `log`   | Forwarded, recorded silently.                                     |

All policies record a drift event, so the proxy shares the same history as
`scan`/`watch`/`diff` (`MCP_WATCH_DB`).

## Notes

- HTTP upstreams only for now (stdio proxying is a follow-up).
- The baseline is whatever `scan`/`watch`/the proxy has already recorded, so a
  first sighting is `first-seen` (allowed); the *change* to a poisoned definition
  is what trips `block`.
