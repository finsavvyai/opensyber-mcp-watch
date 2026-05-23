"""Wrap the npm-published Node CLI via npx so Python users get the same surface."""

import shutil
import subprocess
import sys


PACKAGE = "@opensyber/mcp-watch"


def _have(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def main() -> int:
    if not _have("node"):
        sys.stderr.write(
            "opensyber-mcp-watch: node 20+ is required but `node` was not found on PATH.\n"
            "Install Node.js from https://nodejs.org or your package manager and retry.\n"
        )
        return 127
    runner = "npx"
    if not _have(runner):
        sys.stderr.write(
            "opensyber-mcp-watch: `npx` was not found on PATH but is required to run the Node CLI.\n"
            "npx ships with npm; ensure your Node install includes it.\n"
        )
        return 127
    args = [runner, "-y", PACKAGE, *sys.argv[1:]]
    try:
        completed = subprocess.run(args, check=False)
    except FileNotFoundError as exc:
        sys.stderr.write(f"opensyber-mcp-watch: failed to execute {runner}: {exc}\n")
        return 127
    return completed.returncode
