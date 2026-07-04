#!/usr/bin/env bash
# Release the public @opensyber packages from this monorepo.
#
# This is the self-contained release path — it does not depend on CI or on
# GitHub workflow permissions. Run it locally from the repo root.
#
# What it publishes:
#   - @opensyber/mcp-watch-core   (public)
#   - @opensyber/mcp-watch        (public)
#   - @opensyber/mcp-watch-server is `private` and is skipped by design.
#   `pnpm -r publish` also skips any version already on the registry, so
#   re-running is safe and idempotent.
#
# Prereqs:
#   - Node 20+, pnpm 9+ installed
#   - `npm whoami` succeeds for an account that owns the @opensyber scope
#   - clean git working tree
#
# Usage:
#   scripts/release.sh                 # publish current package versions + tag
#   scripts/release.sh --dry-run       # build/test + `pnpm publish --dry-run`, no upload, no tag
#   scripts/release.sh --no-tag        # publish but do not create/push a git tag
#
set -euo pipefail

DRY_RUN=0
TAG=1
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-tag)  TAG=0 ;;
    *) echo "unknown flag: $arg" >&2; exit 64 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Version is taken from the CLI package (the flagship product) and used for the git tag.
VERSION="$(node -p "require('./packages/cli/package.json').version")"
echo "==> Releasing v${VERSION}"

# --- preflight ------------------------------------------------------------
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ working tree is dirty — commit or stash first." >&2
  exit 1
fi

if [ "$DRY_RUN" -eq 0 ]; then
  if ! npm whoami >/dev/null 2>&1; then
    echo "✗ not logged in to npm. Run 'npm login' as a @opensyber owner first." >&2
    exit 1
  fi
  echo "    npm user: $(npm whoami)"
fi

# --- build + verify -------------------------------------------------------
echo "==> install"
pnpm install --no-frozen-lockfile
echo "==> typecheck"
pnpm typecheck
echo "==> test"
pnpm test
echo "==> build"
pnpm build

# --- publish --------------------------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  echo "==> publish (dry-run)"
  pnpm -r publish --dry-run --no-git-checks --access public
  echo "✓ dry-run complete — nothing published, no tag created."
  exit 0
fi

echo "==> publish to npm"
pnpm -r publish --no-git-checks --access public

# --- tag ------------------------------------------------------------------
if [ "$TAG" -eq 1 ]; then
  if git rev-parse "v${VERSION}" >/dev/null 2>&1; then
    echo "    tag v${VERSION} already exists — skipping tag."
  else
    echo "==> tag v${VERSION}"
    git tag -a "v${VERSION}" -m "v${VERSION}"
    git push origin "v${VERSION}"
  fi
fi

echo ""
echo "✓ Released v${VERSION}"
echo "    https://www.npmjs.com/package/@opensyber/mcp-watch"
echo "    https://www.npmjs.com/package/@opensyber/mcp-watch-core"
