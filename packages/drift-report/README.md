# @opensyber/mcp-watch-drift-report

The **growth engine** behind mcp-watch: point it at public MCP servers, record a
fingerprint of every tool definition on a schedule, then generate the **MCP Drift
Report** — the original-data artifact the launch runs on.

Only mcp-watch can produce this: it's the *cross-run* history that single-scan
tools never have. The report scores drift with the **same** `@opensyber/mcp-watch-core`
engine the product ships, so the evidence is the product.

> Private workspace tool — not published to npm.

## Use

```bash
pnpm --filter @opensyber/mcp-watch-drift-report build

# 1. Curate the servers to watch.
#    servers.candidates.json holds vet-ready public endpoints — validate each,
#    then copy the ones that work into servers.json.
$EDITOR packages/drift-report/servers.json

# 2. Take a snapshot — run on a schedule (cron/systemd) for ~7 days
node packages/drift-report/dist/cli.js snapshot \
  --servers packages/drift-report/servers.json \
  --store drift-data/snapshots.jsonl

# 3. Generate the report from the accumulated snapshots
node packages/drift-report/dist/cli.js report \
  --store drift-data/snapshots.jsonl --out drift-data/out
# → drift-data/out/report.md, dataset.json, chart.svg
```

A cron line for hourly snapshots over a week:

```cron
0 * * * * cd /path/to/repo && node packages/drift-report/dist/cli.js snapshot >> drift-data/cron.log 2>&1
```

## Output

- **`report.md`** — the publishable post: headline counts, a table of every tool
  that changed and *why*, unreachable servers, and a reproducible method section.
- **`dataset.json`** — the full model (per-tool timelines) for your own charts.
- **`chart.svg`** — a dependency-free stable/drifted/suspicious bar chart.

## Ethics

The report only ever names a server you put in `servers.json`. Prefer disclosing
a genuine `suspicious` finding to the maintainer before publishing names.

## How it works

```
servers.json ──▶ snapshot (fetch tools/list, fingerprint) ──▶ snapshots.jsonl (append-only)
                                                                     │
                                       report ◀── buildReport (core.classifyDrift) ──┘
                                          └─▶ report.md · dataset.json · chart.svg
```
