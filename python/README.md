# opensyber-mcp-watch (Python)

Thin Python wrapper for [`@opensyber/mcp-watch`](https://github.com/finsavvyai/opensyber-mcp-watch).

This package exists so you can `pip install opensyber-mcp-watch` and get a working binary on `$PATH`. Under the hood it shells out to the Node CLI via `npx -y @opensyber/mcp-watch`.

## Install

```bash
pip install opensyber-mcp-watch
```

Requires Node.js 20+ on `$PATH`. If `node` isn't available the wrapper will exit with a clear error.

## Use

```bash
opensyber-mcp-watch init
opensyber-mcp-watch scan
opensyber-mcp-watch watch
```

Identical CLI surface to the npm package — every argument is forwarded.

## Why a wrapper?

The fingerprinting and storage logic is in TypeScript. Maintaining two implementations would let them drift. The wrapper gives PyPI presence (Python AI/ML community) without the maintenance cost.

## License

MIT
