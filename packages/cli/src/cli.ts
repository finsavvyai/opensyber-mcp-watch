import { initCommand } from './commands/init.js';
import { scanCommand } from './commands/scan.js';
import { watchCommand } from './commands/watch.js';
import { historyCommand } from './commands/history.js';
import { diffCommand } from './commands/diff.js';
import { c } from './output.js';

const VERSION = '0.4.0';

const HELP = `${c.bold('opensyber-mcp-watch')} ${VERSION}
MCP rug-pull detection. Records SHA-256 fingerprints per tool, per server, across days.

usage:
  opensyber-mcp-watch <command> [options]

commands:
  init                          one-time setup; writes ~/.opensyber/mcp-watch.config.json
  scan [--json]                 one-shot fingerprint of tools, prompts & resources (--json for CI/SIEM)
  watch [--interval 60s]        long-running watcher; prints drift events as they happen
  history <server> <tool>       show fingerprints over time (7 days)
  diff <server> <tool>          compare current state vs stored fingerprint
  --version, -v                 print version
  --help, -h                    show this help

servers (in config file): each has a "name" plus either
  "url" (http transport)  or  "command" + "args" (stdio transport).

config:
  MCP_WATCH_CONFIG              path to config file (default: ~/.opensyber/mcp-watch.config.json)
  MCP_WATCH_DB                  path to SQLite db (default: ~/.opensyber/mcp-watch.db)
  MCP_WATCH_CLOUD_ENDPOINT      opt-in: push observations to this cloud ingest URL
  MCP_WATCH_CLOUD_KEY           opt-in: API key for the cloud endpoint
  MCP_WATCH_WEBHOOK_URL         opt-in: POST drift alerts to this webhook (watch)
  NO_COLOR                      disable ANSI color when set

exit codes:
  0 clean · 2 suspicious drift detected · 64 usage · 1 error

docs:    https://opensyber.cloud
report:  https://github.com/finsavvyai/opensyber-mcp-watch/issues
`;

async function main(): Promise<number> {
  const [, , ...argv] = process.argv;
  const cmd = argv[0];
  const rest = argv.slice(1);
  switch (cmd) {
    case undefined:
    case '--help':
    case '-h':
    case 'help':
      process.stdout.write(HELP);
      return 0;
    case '--version':
    case '-v':
    case 'version':
      process.stdout.write(VERSION + '\n');
      return 0;
    case 'init':
      return initCommand();
    case 'scan':
      return scanCommand(rest);
    case 'watch':
      return watchCommand(rest);
    case 'history':
      return historyCommand(rest);
    case 'diff':
      return diffCommand(rest);
    default:
      process.stderr.write(c.alert(`Unknown command '${cmd}'.\n`));
      process.stderr.write(HELP);
      return 64;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(c.alert(`✗ ${msg}\n`));
    process.exit(1);
  });
