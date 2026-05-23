import { loadConfig, DEFAULT_INTERVAL_MS } from '../config.js';
import { Storage } from '../storage.js';
import { watchLoop } from '../watcher.js';
import { c } from '../output.js';

function parseInterval(arg: string): number {
  const m = /^(\d+)(s|m|h)?$/.exec(arg);
  if (!m) throw new Error(`Invalid interval '${arg}'. Use 60s, 5m, 1h, or plain ms.`);
  const n = Number(m[1]);
  switch (m[2]) {
    case 'h': return n * 60 * 60 * 1000;
    case 'm': return n * 60 * 1000;
    case 's': return n * 1000;
    default: return n;
  }
}

export async function watchCommand(args: string[]): Promise<number> {
  const cfg = loadConfig();
  let interval = cfg.interval_ms ?? DEFAULT_INTERVAL_MS;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interval' && args[i + 1]) {
      interval = parseInterval(args[i + 1]);
      i++;
    }
  }
  const storage = new Storage();
  process.stdout.write(
    c.bold('opensyber-mcp-watch') +
      ` watching ${cfg.servers.length} server(s), interval ${Math.round(interval / 1000)}s\n`,
  );
  process.stdout.write(c.dim('Press Ctrl+C to stop.\n\n'));

  return new Promise<number>((resolve) => {
    const handle = watchLoop(storage, cfg, interval);
    const stopAndExit = (): void => {
      handle.stop();
      storage.close();
      process.stdout.write(c.dim('\nwatcher stopped.\n'));
      resolve(0);
    };
    process.on('SIGINT', stopAndExit);
    process.on('SIGTERM', stopAndExit);
  });
}
