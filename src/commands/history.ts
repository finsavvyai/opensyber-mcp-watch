import { loadConfig } from '../config.js';
import { Storage } from '../storage.js';
import { c, timestamp } from '../output.js';

export async function historyCommand(args: string[]): Promise<number> {
  if (args.length < 2) {
    process.stderr.write(`usage: opensyber-mcp-watch history <server-name> <tool-name>\n`);
    return 64;
  }
  const [serverName, toolName] = args;
  const cfg = loadConfig();
  const server = cfg.servers.find((s) => s.name === serverName);
  if (!server) {
    process.stderr.write(c.alert(`Unknown server '${serverName}'. Known: ${cfg.servers.map((s) => s.name).join(', ')}\n`));
    return 1;
  }
  const storage = new Storage();
  try {
    const rows = storage.history(server.url, toolName, 100);
    if (rows.length === 0) {
      process.stdout.write(c.dim(`No history for ${serverName}/${toolName} in last 7 days.\n`));
      return 0;
    }
    process.stdout.write(c.bold(`History for ${serverName}/${toolName}:\n\n`));
    for (const r of rows) {
      process.stdout.write(
        `  ${c.dim(timestamp(r.observedAt))}  ${c.hash(r.fingerprint)}\n`,
      );
    }
    process.stdout.write(c.dim(`\n${rows.length} observation(s).\n`));
    return 0;
  } finally {
    storage.close();
  }
}
