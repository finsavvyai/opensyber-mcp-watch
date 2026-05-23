import type { DriftResult } from './differ.js';
import { c, timestamp } from './output.js';

export interface DriftAlert {
  serverName: string;
  serverUrl: string;
  toolName: string;
  verdict: DriftResult['verdict'];
  reason: string;
  oldFingerprint: string | null;
  newFingerprint: string;
  diffSummary: string;
  observedAt: number;
}

export function formatAlertForConsole(a: DriftAlert): string {
  const ts = c.dim(timestamp(a.observedAt));
  let banner: string;
  switch (a.verdict) {
    case 'suspicious-injection':
      banner = c.alert('[DRIFT DETECTED]') + ' ' + ts;
      break;
    case 'version-bump':
      banner = c.warn('[VERSION DRIFT]') + ' ' + ts;
      break;
    case 'first-seen':
      banner = c.info('[BASELINE]') + ' ' + ts;
      break;
    case 'unchanged':
      banner = c.ok('[OK]') + ' ' + ts;
      break;
  }
  const lines = [
    banner,
    '',
    `  ${c.bold('Server:')} ${a.serverName} (${a.serverUrl})`,
    `  ${c.bold('Tool:')}   ${a.toolName}`,
    '',
    `  ${c.bold('Old fingerprint:')} ${a.oldFingerprint ? c.hash(a.oldFingerprint) : c.dim('(none — first observation)')}`,
    `  ${c.bold('New fingerprint:')} ${c.hash(a.newFingerprint)}`,
    '',
    `  ${c.bold('Reason:')} ${a.reason}`,
  ];
  if (a.diffSummary && a.diffSummary !== '(unchanged)' && a.diffSummary !== '(baseline)') {
    lines.push('');
    lines.push(`  ${c.bold('Changes:')}`);
    for (const ln of a.diffSummary.split('\n')) lines.push(`    ${ln}`);
  }
  if (a.verdict === 'suspicious-injection') {
    lines.push('');
    lines.push(c.alert('  → Quarantine recommended. Disconnect agent from this MCP server until reviewed.'));
    lines.push(c.dim('    Documented at https://opensyber.cloud/threats/mcp-rugpull'));
  }
  return lines.join('\n');
}
