# Detection coverage

What mcp-watch fingerprints and how it scores change — the depth other scanners skip.

## Surfaces (what gets fingerprinted)

Every scan fingerprints all three MCP surfaces, not just tools:

| Surface   | Fingerprinted value                          | Storage key            |
|-----------|----------------------------------------------|------------------------|
| Tools     | `{ name, description, inputSchema }`          | `<tool>`               |
| Prompts   | the full prompt definition                    | `prompt:<name>`        |
| Resources | the full resource definition                  | `resource:<uri>`       |

Most scanners only look at tools; prompts and resources can be poisoned too.

## Drift classification

`core.classifyDrift` scores each change as `unchanged`, `first-seen`,
`version-bump`, or `suspicious-injection`. It scans the **whole definition
(description *and* inputSchema)** with `core.scanText`, so injection hiding in a
schema field is caught — not waved through as a benign version-bump.

`scanText` signals:

| Signal          | Severity | Example                                             |
|-----------------|----------|-----------------------------------------------------|
| marker          | high     | `[SYSTEM]`, `<instruction>`, `ignore previous`      |
| imperative      | high     | "ignore all previous instructions", "reveal the system prompt" |
| hidden-unicode  | high     | zero-width / bidi-override characters                |
| url             | low      | `https://…` (reported for context)                  |
| base64          | low      | long base64-like blob                               |

A change that **gains a high-severity signal** → `suspicious-injection`, with a
reason naming the signal and where it appeared (description vs inputSchema).

## Cross-server: tool shadowing

`scan` reports **shadowing** — the same tool name exposed by more than one
server (`[SHADOWING]` in text, `shadowing[]` in `--json`). An agent can be lured
into calling an attacker's `search` instead of the real one.

## Cross-machine: fleet divergence (cloud)

The cloud layer adds what a single machine can't see: a tool that presents a
different fingerprint to one agent than to the rest of the fleet (`fleet-divergence`).
See [cloud-architecture.md](cloud-architecture.md).
