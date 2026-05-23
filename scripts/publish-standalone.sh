#!/usr/bin/env bash
# Publish packages/mcp-watch as a standalone public repo at finsavvyai/opensyber-mcp-watch.
# Run from inside packages/mcp-watch.
#
# Prereqs:
#   - gh CLI authenticated as finsavvyai with repo scope
#   - npm logged in to a user/org that owns the @opensyber scope
#   - Optional: NPM_TOKEN / PYPI_TOKEN set as GitHub secrets afterward

set -euo pipefail

REPO="finsavvyai/opensyber-mcp-watch"
STAGE="${TMPDIR:-/tmp}/opensyber-mcp-watch.stage"
PKG_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Staging at $STAGE"
rm -rf "$STAGE"
mkdir -p "$STAGE"

# Copy everything EXCEPT node_modules / dist / coverage
rsync -a --exclude node_modules --exclude dist --exclude coverage \
  --exclude .turbo --exclude '*.tsbuildinfo' \
  "$PKG_DIR/" "$STAGE/"

cd "$STAGE"

echo "==> git init + first commit"
git init -q -b main
git add .
git -c user.email='support@opensyber.cloud' -c user.name='OpenSyber' \
  commit -q -m "feat: initial release v0.1.0

@opensyber/mcp-watch — MCP rug-pull detection.
Records SHA-256 fingerprints per tool, per server, across days."

echo "==> gh repo create"
if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "    repo already exists — pushing to main"
else
  gh repo create "$REPO" \
    --public \
    --license MIT \
    --description "MCP rug-pull detection. SHA-256 fingerprints per tool, per server, across days." \
    --homepage "https://opensyber.cloud"
fi

git remote add origin "git@github.com:${REPO}.git" 2>/dev/null || \
  git remote set-url origin "git@github.com:${REPO}.git"
git push -u origin main --force-with-lease

echo "==> repo topics"
gh repo edit "$REPO" \
  --add-topic mcp \
  --add-topic model-context-protocol \
  --add-topic ai-security \
  --add-topic ai-agents \
  --add-topic prompt-injection \
  --add-topic security \
  --add-topic drift-detection \
  --add-topic opensyber || true

echo ""
echo "Done. Repo: https://github.com/${REPO}"
echo ""
echo "Next steps (manual — gated for safety):"
echo "  1. Add NPM_TOKEN and PYPI_TOKEN as GitHub secrets:"
echo "     gh secret set NPM_TOKEN  -R $REPO"
echo "     gh secret set PYPI_TOKEN -R $REPO"
echo ""
echo "  2. Record the demo GIF (see demo/SCRIPT.md)"
echo ""
echo "  3. 24-hour burn-in: smoke test on a friend's machine, get 3-5 friendly stars."
echo ""
echo "  4. Tag the release to trigger npm + PyPI publish:"
echo "     git -C $STAGE tag v0.1.0 -m 'v0.1.0'"
echo "     git -C $STAGE push origin v0.1.0"
