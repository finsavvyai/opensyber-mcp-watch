import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { takeSnapshot } from './snapshot.js';
import { readRecords, appendRecords } from './store.js';
import { buildReport } from './report.js';
import { renderMarkdown, renderSvg, renderDataset } from './render.js';
import type { ServerEntry } from './types.js';

const HELP = `mcp-drift-report — watch public MCP servers over time and generate the MCP Drift Report

usage:
  mcp-drift-report snapshot [--servers servers.json] [--store drift-data/snapshots.jsonl]
  mcp-drift-report report   [--store drift-data/snapshots.jsonl] [--out drift-data/out]

Run 'snapshot' on a schedule (e.g. hourly for 7 days), then 'report' to emit
report.md + dataset.json + chart.svg. See README.md.
`;

function flag(rest: string[], name: string, def: string): string {
  const i = rest.indexOf(name);
  return i >= 0 && rest[i + 1] ? rest[i + 1]! : def;
}

function loadServers(path: string): ServerEntry[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { servers?: ServerEntry[] };
  if (!Array.isArray(parsed.servers) || parsed.servers.length === 0) {
    throw new Error(`${path} must contain a non-empty "servers" array.`);
  }
  return parsed.servers;
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === 'snapshot') {
    const servers = loadServers(flag(rest, '--servers', 'servers.json'));
    const store = flag(rest, '--store', 'drift-data/snapshots.jsonl');
    const runAt = Date.now();
    const records = await takeSnapshot(servers, { runAt });
    appendRecords(store, records);
    const errors = records.filter((r) => r.error).length;
    const tools = records.filter((r) => r.toolName).length;
    process.stdout.write(`snapshot @ ${new Date(runAt).toISOString()}: ${tools} tools, ${errors} unreachable → ${store}\n`);
    return 0;
  }

  if (cmd === 'report') {
    const store = flag(rest, '--store', 'drift-data/snapshots.jsonl');
    const out = flag(rest, '--out', 'drift-data/out');
    const records = readRecords(store);
    if (records.length === 0) {
      process.stderr.write(`No snapshots in ${store}. Run 'snapshot' first.\n`);
      return 1;
    }
    const model = buildReport(records, Date.now());
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'report.md'), renderMarkdown(model), 'utf8');
    writeFileSync(join(out, 'dataset.json'), renderDataset(model), 'utf8');
    writeFileSync(join(out, 'chart.svg'), renderSvg(model), 'utf8');
    process.stdout.write(
      `report: ${model.toolCount} tools (${model.counts.suspicious} suspicious, ${model.counts.drifted} drifted) → ${out}/\n`,
    );
    return 0;
  }

  process.stdout.write(HELP);
  return cmd ? 64 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`✗ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
