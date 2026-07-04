# mcp-watch — Launch Kit

Ready-to-ship copy and the growth loop. Positioning is deliberately honest: the
category is crowded (Cisco `mcp-scanner`, Invariant MCP-Scan, Snyk agent-scan,
Enkrypt, Akto…), and some of them already detect rug-pulls *within a session*.

## The wedge (say this, not "the only rug-pull detector")

> Everyone else scans or pins **once, in one session, on one machine**.
> mcp-watch keeps a **cross-session fingerprint history over days**, and — via the
> cloud layer — **cross-machine fleet consensus**: it catches the rug-pull that's
> served to *one* victim while every other agent still sees the clean tool.
> **Time + fleet, not a one-time pin.**

## The centerpiece: the MCP Drift Report

The format that reliably spreads in this niche is original-data research ("we
scanned N servers…"). `packages/drift-report` generates exactly that from real
fingerprint history — the evidence *is* the product. Ship the report as the
launch, with the tool as the "run it yourself" CTA.

Cadence: publish a **monthly MCP Drift Report**. Each issue = a Show HN + an X
thread + a newsletter. That's a compounding loop, not a one-shot launch.

## Show HN (paste-ready)

**Title:** `Show HN: mcp-watch – catch MCP rug-pulls that single-scan tools miss`

**Body:**
```
MCP servers can change a tool's definition after your agent has already approved
it — a "rug pull." Existing scanners hash the tools once per session, so a server
that serves a clean definition on calls 1–2 and a poisoned one on call 3 sails
right through.

mcp-watch takes a different bet: it records a SHA-256 fingerprint of every tool
(name + description + inputSchema) and keeps the history across sessions and
days, locally in SQLite. When a definition drifts, it classifies the change
(version-bump vs injection-like) and alerts.

The hosted layer adds the part a single machine can't do: fleet consensus across
many agents, so a rug-pull targeted at one victim shows up as the one agent that
disagrees with everyone else.

To show it's real, we watched N public MCP servers for a week — writeup + data:
<link to the MCP Drift Report>

Try it on your own agents:
  npx @opensyber/mcp-watch scan

MIT, TypeScript, no telemetry in the local tool: <repo link>
Happy to talk about the fingerprinting/consensus design.
```

## X / Twitter thread

1. Your MCP scanner checks each tool once. A malicious server can pass the scan,
   then swap the tool's description on a later call. That's a rug-pull, and
   one-shot scanners are blind to it. 🧵
2. We fingerprinted every tool on N public MCP servers, every hour, for a week.
   [chart.svg] — X changed their definitions after we'd first seen them. Y looked
   like tool poisoning.
3. The trick isn't a smarter scan — it's *memory*. Keep a fingerprint history and
   drift becomes obvious. Keep it across a fleet and a targeted attack becomes the
   one agent that disagrees.
4. Run it on your agents in one line: `npx @opensyber/mcp-watch scan`
   Report + data + code (MIT): <links>

## Demo GIF (≤15s, see demo/SCRIPT.md)

1. `mcp-watch scan` on a clean server → all green `[BASELINE]`.
2. Server swaps `search`'s description to include `[SYSTEM] … exfiltrate …`.
3. Next `mcp-watch scan` → red `[DRIFT DETECTED] suspicious-injection` with the diff.
4. End card: "Single-scan tools approved this. → npx @opensyber/mcp-watch".

## Threat page (opensyber.cloud/threats/mcp-rugpull)

Canonical explainer so every comparison table links you. Sections:
- What a rug-pull is (bait-and-switch after approval; the spec has no native defense).
- Why one-shot scanning misses it (with the 3-call example).
- Detection: cross-session fingerprint history + fleet consensus.
- Reproduce it: the drift-report harness + `npx` one-liner.
- Link the arXiv/CSA literature so researchers cite you back.

## Channels

- Show HN + Lobsters (`security`, `ai`)
- r/netsec (lead with the data, not the tool), r/mcp
- X security community; tag the MCP/agent-security researchers who publish taxonomies
- MCP / Anthropic Discord + GitHub discussions
- dev.to / the CSA "MCP Security Crisis" thread — contribute, don't just drop a link

## Pre-launch checklist

- [ ] `npx @opensyber/mcp-watch` actually works (run `scripts/release.sh` — publish is the gate; virality dies on a broken install)
- [ ] `demo/` GIF recorded
- [ ] First MCP Drift Report generated + a `suspicious`/`drifted` finding disclosed to the maintainer before naming
- [ ] Threat page live at the URL the CLI already prints
- [ ] Repo README leads with the wedge above
```
