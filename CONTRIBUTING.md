# Contributing

Thanks for considering a contribution. This is a small, opinionated package — issues and small PRs are more useful than large redesigns.

## Setup

```bash
git clone https://github.com/finsavvyai/opensyber-mcp-watch.git
cd opensyber-mcp-watch
pnpm install          # or npm install
pnpm test             # runs vitest
pnpm build            # builds dist/
pnpm typecheck
```

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

## Security

See [SECURITY.md](SECURITY.md). Do not file public issues for vulnerabilities.

## License

By contributing, you agree your contributions are licensed under MIT.
