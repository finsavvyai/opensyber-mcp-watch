# @opensyber/mcp-watch-core

The transport- and storage-agnostic heart of [mcp-watch](https://github.com/finsavvyai/opensyber-mcp-watch):
canonical fingerprinting of MCP tool definitions and classification of how they drift over time.

This package has **no runtime dependencies** and no I/O. It is consumed by:

- **`@opensyber/mcp-watch`** — the local CLI / watcher.
- the **OpenSyber cloud layer** — the hosted ingest + analysis service.

Keeping detection logic here means the agent and the server score drift with *identical* rules.

## API

```ts
import { fingerprintTool, canonicalJson, classifyDrift } from '@opensyber/mcp-watch-core';

const fp = await fingerprintTool({ name, description, inputSchema }); // SHA-256 hex
const verdict = classifyDrift({ oldFingerprint, newFingerprint, oldDescription, newDescription, oldInputSchema, newInputSchema });
// verdict.verdict ∈ 'unchanged' | 'first-seen' | 'version-bump' | 'suspicious-injection'
```

`fingerprintTool` hashes the **canonical** JSON of `{ name, description, inputSchema }`, so cosmetic
key reordering is invisible while any semantic change moves the fingerprint.

## License

MIT
