# @opensyber/mcp-watch

MCP rug-pull detection. Records SHA-256 fingerprints per tool, per server, across
days — catches tampering that session-scoped scanners miss.

> Full documentation, threat model, and examples live in the
> [repository README](https://github.com/finsavvyai/opensyber-mcp-watch#readme).

```bash
npm i -g @opensyber/mcp-watch
opensyber-mcp-watch init      # one-time setup
opensyber-mcp-watch scan      # establish a baseline
opensyber-mcp-watch watch     # long-running watcher
opensyber-mcp-watch diff <server> <tool>
```

The detection logic is the shared [`@opensyber/mcp-watch-core`](https://www.npmjs.com/package/@opensyber/mcp-watch-core)
package, so this CLI and the OpenSyber cloud layer score drift with identical rules.

## License

MIT
