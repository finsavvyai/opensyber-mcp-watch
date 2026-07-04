# Contributing

Thanks for considering a contribution. This is a small, opinionated package — issues and small PRs are more useful than large redesigns.

## Setup

```bash
git clone https://github.com/finsavvyai/opensyber-mcp-watch.git
cd opensyber-mcp-watch
pnpm install          # installs the whole workspace
pnpm test             # vitest across all packages
pnpm build            # builds every package's dist/
pnpm typecheck
```

This is a pnpm workspace:

- `packages/core` (`@opensyber/mcp-watch-core`) — fingerprinting + drift rules, no deps/no I/O.
- `packages/cli` (`@opensyber/mcp-watch`) — the local watcher.
- `packages/server` (`@opensyber/mcp-watch-server`) — the hosted cloud layer (see [docs/cloud-architecture.md](docs/cloud-architecture.md)).

Run a single package with `pnpm --filter <name> <script>`.

Node 20+ required. `better-sqlite3` is a native module — `pnpm rebuild better-sqlite3` if you see binding errors after a Node upgrade.

## PR conventions

- Small. One concern per PR.
- Tests pass and new behavior has new tests.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, etc.).
- No dependencies added without an issue first.
- No new top-level files without an issue first.
- Match existing style (no Prettier config, just keep it readable).

## What we want

- New MCP transport support (stdio is high priority)
- Better drift heuristics for injection detection
- Output formats for SIEM ingestion (JSON, CEF)
- Webhook alert delivery (Slack, Discord, PagerDuty)
- Cross-platform install improvements

## What we don't want

- Re-architecture proposals without a working prototype
- Adding cloud features that should be hosted (cross-machine sync, multi-week history, behavioral baselines)
- Logo redesigns
- Renaming things

## Releasing

Two paths publish the public packages (`@opensyber/mcp-watch-core` and
`@opensyber/mcp-watch`; the `server` package is `private` and never published).

**Local (self-contained, recommended):**

```bash
scripts/release.sh --dry-run   # build + test + `pnpm publish --dry-run`, no upload
scripts/release.sh             # publish to npm + push a vX.Y.Z tag
```

Requires `npm whoami` to succeed for a `@opensyber` owner. `pnpm -r publish`
skips already-published versions and private packages, so it is idempotent.
Bump versions in `packages/*/package.json` (and `VERSION` in
`packages/cli/src/cli.ts`) before releasing.

**CI (tag-triggered):** pushing a `vX.Y.Z` tag runs `.github/workflows/publish.yml`.
That workflow must run **`pnpm -r publish`** (not `pnpm publish`) — the workspace
root is `private`, so the plain command publishes nothing. Keep that line in sync
with the local script.

## Security

See [SECURITY.md](SECURITY.md). Do not file public issues for vulnerabilities.

## License

By contributing, you agree your contributions are licensed under MIT.
