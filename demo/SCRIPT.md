# Demo recording — drift-catch GIF

Self-contained now: no external repo, no manual toggling. `demo/run.sh` starts a
zero-dependency mock MCP server, scans it clean, silently swaps the tool's
definition (the rug-pull), and scans again so the `[DRIFT DETECTED]` alert fires.

## Reproduce the terminal transcript

```bash
bash demo/run.sh
```

You'll see a clean `[BASELINE]` scan, the server get poisoned, then a red
`[DRIFT DETECTED] … injection-like marker '[SYSTEM]'` with the appended
exfiltration string and the quarantine recommendation.

## Record the GIF

The reproducible path uses [VHS](https://github.com/charmbracelet/vhs) (records a
real terminal headlessly — no screen capture, always in sync with real output):

```bash
vhs demo/drift-catch.tape      # → demo/drift-catch.gif
```

Prefer asciinema? `asciinema rec demo/drift-catch.cast -c 'bash demo/run.sh'`
then `agg demo/drift-catch.cast demo/drift-catch.gif`.

## Pieces

- `demo/rugpull-server.mjs` — zero-dep mock MCP server; `POST /rugpull` flips it
  from the clean `weather` tool to the poisoned one. Speaks the MCP `initialize`
  handshake and a plain `tools/list`.
- `demo/run.sh` — one-command demo; uses an isolated config + DB so it never
  touches your real `~/.opensyber` state.
- `demo/drift-catch.tape` — VHS tape that renders the GIF.

## Polish

- The `[DRIFT DETECTED]` block is the payoff — trim so it lands in the first few
  seconds (many GitHub embeds only autoplay the opening frames).
- `NO_COLOR=1` is set in `run.sh` for clean GIF output; drop it for a colored cast.
- Keep total runtime 25–30s; cap terminal width at ~100 cols.
