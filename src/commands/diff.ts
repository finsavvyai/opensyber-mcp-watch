import { loadConfig } from '../config.js';
import { Storage } from '../storage.js';
import { fetchToolsList } from '../mcp-client.js';
import { fingerprintTool, canonicalJson } from '../fingerprint.js';
import { classifyDrift } from '../differ.js';
import { formatAlertForConsole } from '../alert.js';
import { c } from '../output.js';

export async function diffCommand(args: string[]): Promise<number> {
  if (args.length < 2) {
    process.stderr.write(`usage: opensyber-mcp-watch diff <server-name> <tool-name>\n`);
    return 64;
  }
  const [serverName, toolName] = args;
  const cfg = loadConfig();
  const server = cfg.servers.find((s) => s.name === serverName);
  if (!server) {
    process.stderr.write(c.alert(`Unknown server '${serverName}'.\n`));
    return 1;
  }
  const storage = new Storage();
  try {
    const stored = storage.getCurrent(server.url, toolName);
    if (!stored) {
      process.stderr.write(c.alert(`No stored fingerprint for ${serverName}/${toolName}. Run 'scan' first.\n`));
      return 1;
    }
    const tools = await fetchToolsList(server.url, { headers: server.headers });
    const current = tools.find((t) => t.name === toolName);
    if (!current) {
      process.stderr.write(c.alert(`Tool '${toolName}' not present on ${serverName} right now.\n`));
      return 1;
    }
    const fp = await fingerprintTool(current);
    const drift = classifyDrift({
      oldFingerprint: stored.fingerprint,
      newFingerprint: fp,
      oldDescription: stored.description,
      newDescription: current.description,
      oldInputSchema: stored.inputSchema,
      newInputSchema: canonicalJson(current.inputSchema),
    });
    const alert = {
      serverName: server.name,
      serverUrl: server.url,
      toolName,
      verdict: drift.verdict,
      reason: drift.reason,
      oldFingerprint: stored.fingerprint,
      newFingerprint: fp,
      diffSummary: drift.diffSummary,
      observedAt: Date.now(),
    };
    process.stdout.write(formatAlertForConsole(alert) + '\n');
    return drift.verdict === 'suspicious-injection' ? 2 : 0;
  } finally {
    storage.close();
  }
}
