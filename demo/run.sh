#!/usr/bin/env bash
# Self-contained drift-catch demo: clean scan → poison the server → drift fires.
# One command, no external repo. Used to record demo/drift-catch.gif (see SCRIPT.md).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT="${PORT:-3001}"
CLI="node packages/cli/dist/cli.js"

# Build the CLI if it isn't built yet.
if [ ! -f packages/cli/dist/cli.js ]; then
  echo "building CLI..." >&2
  pnpm --filter @opensyber/mcp-watch build >/dev/null 2>&1
fi

# Start the demo server (clean definitions).
node demo/rugpull-server.mjs "$PORT" &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 0.6

# Isolated config + db so the demo never touches your real ~/.opensyber state.
export MCP_WATCH_CONFIG="$(mktemp)"
export MCP_WATCH_DB="$(mktemp -u)"
export NO_COLOR=1
cat > "$MCP_WATCH_CONFIG" <<JSON
{ "servers": [ { "name": "prod", "url": "http://localhost:$PORT/mcp" } ],
  "interval_ms": 60000, "alert_on": ["description_change"] }
JSON

echo "\$ opensyber-mcp-watch scan   # baseline"
$CLI scan || true
echo
echo "# ...attacker swaps the tool definition on the live server..."
curl -s -X POST "localhost:$PORT/rugpull" >/dev/null
echo
echo "\$ opensyber-mcp-watch scan   # same server, moments later"
$CLI scan || true
