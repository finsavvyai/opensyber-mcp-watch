import { loadConfig, resolveCloud, serverKey } from '../config.js';
import { Storage } from '../storage.js';
import { scanOnce, type ScanResult } from '../watcher.js';
import { formatAlertForConsole } from '../alert.js';
import { formatScanJson } from '../report-json.js';
import { c } from '../output.js';

export async function scanCommand(args: string[] = []): Promise<number> {
  const json = args.includes('--json');
  const cfg = loadConfig();
  const cloud = resolveCloud(cfg);
  const storage = new Storage();
  const results: ScanResult[] = [];
  try {
    if (cloud && !json) process.stdout.write(c.dim(`Cloud push enabled → ${cloud.endpoint}\n`));
    for (const server of cfg.servers) {
      if (!json) process.stdout.write(c.info(`Scanning ${server.name} (${serverKey(server)})...\n`));
      const result = await scanOnce(storage, server, cloud);
      results.push(result);
      if (json) continue;
      if (result.error) {
        process.stderr.write(c.alert(`  ✗ ${result.error}\n`));
        continue;
      }
      if (result.cloudPush && !result.cloudPush.ok) {
        process.stderr.write(c.warn(`  · cloud push failed: ${result.cloudPush.error}\n`));
      }
      for (const a of result.alerts) process.stdout.write(formatAlertForConsole(a) + '\n\n');
    }
  } finally {
    storage.close();
  }
  if (json) process.stdout.write(formatScanJson(results, Date.now()) + '\n');
  const suspicious = results.some((r) => r.alerts.some((a) => a.verdict === 'suspicious-injection'));
  return suspicious ? 2 : 0;
}
