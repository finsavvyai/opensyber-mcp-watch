import { loadConfig } from '../config.js';
import { Storage } from '../storage.js';
import { scanOnce } from '../watcher.js';
import { formatAlertForConsole } from '../alert.js';
import { c } from '../output.js';

export async function scanCommand(): Promise<number> {
  const cfg = loadConfig();
  const storage = new Storage();
  let suspicious = 0;
  try {
    for (const server of cfg.servers) {
      process.stdout.write(c.info(`Scanning ${server.name} (${server.url})...\n`));
      const result = await scanOnce(storage, server);
      if (result.error) {
        process.stderr.write(c.alert(`  ✗ ${result.error}\n`));
        continue;
      }
      for (const a of result.alerts) {
        if (a.verdict === 'suspicious-injection') suspicious++;
        process.stdout.write(formatAlertForConsole(a) + '\n\n');
      }
    }
  } finally {
    storage.close();
  }
  return suspicious > 0 ? 2 : 0;
}
