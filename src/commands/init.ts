import { createInterface } from 'node:readline/promises';
import { existsSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { defaultConfigPath, saveConfig } from '../config.js';
import { c } from '../output.js';

export async function initCommand(): Promise<number> {
  const path = defaultConfigPath();
  if (existsSync(path)) {
    process.stdout.write(c.warn(`Config already exists at ${path}.\n`));
    process.stdout.write(c.dim(`Edit it directly or delete to re-init.\n`));
    return 0;
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    process.stdout.write(c.bold('opensyber-mcp-watch') + ' setup\n\n');
    const url = (await rl.question('First MCP server URL (http(s)://): ')).trim();
    if (!/^https?:\/\//.test(url)) {
      process.stderr.write(c.alert('URL must start with http:// or https://\n'));
      return 1;
    }
    const name = (await rl.question('Friendly name for this server [default: server-1]: ')).trim() || 'server-1';
    const intervalAnswer = (await rl.question('Poll interval in seconds [default: 300]: ')).trim();
    const intervalSec = intervalAnswer === '' ? 300 : Number(intervalAnswer);
    if (!Number.isFinite(intervalSec) || intervalSec < 10) {
      process.stderr.write(c.alert('Interval must be a number ≥ 10 seconds.\n'));
      return 1;
    }
    saveConfig({
      servers: [{ url, name }],
      interval_ms: intervalSec * 1000,
      alert_on: ['description_change', 'schema_change', 'tool_added', 'tool_removed'],
    });
    process.stdout.write(c.ok(`\n✓ Wrote ${path}\n\n`));
    process.stdout.write(`Next:\n`);
    process.stdout.write(`  ${c.bold('opensyber-mcp-watch scan')}     — establish baseline fingerprints\n`);
    process.stdout.write(`  ${c.bold('opensyber-mcp-watch watch')}    — start the long-running watcher\n`);
    return 0;
  } finally {
    rl.close();
  }
}
