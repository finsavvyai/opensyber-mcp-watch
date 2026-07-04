import { loadConfig, resolveCloud, serverKey } from '../config.js';
import { Storage } from '../storage.js';
import { scanOnce } from '../watcher.js';
import { formatAlertForConsole } from '../alert.js';
import { c } from '../output.js';

export async function scanCommand(): Promise<number> {
  const cfg = loadConfig();
  const cloud = resolveCloud(cfg);
  const storage = new Storage();
  let suspicious = 0;
  try {
    if (cloud) process.stdout.write(c.dim(`Cloud push enabled → ${cloud.endpoint}\n`));
    for (const server of cfg.servers) {
      process.stdout.write(c.info(`Scanning ${server.name} (${serverKey(server)})...\n`));
      const result = await scanOnce(storage, server, cloud);
      if (result.error) {
        process.stderr.write(c.alert(`  ✗ ${result.error}\n`));
        continue;
      }
      if (result.cloudPush && !result.cloudPush.ok) {
        process.stderr.write(c.warn(`  · cloud push failed: ${result.cloudPush.error}\n`));
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
