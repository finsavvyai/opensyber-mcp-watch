import type { ScanResult } from './watcher.js';

/** Machine-readable scan output for SIEM ingestion / CI gating (`scan --json`). */
export function formatScanJson(results: ScanResult[], generatedAt: number): string {
  const all = results.flatMap((r) => r.alerts);
  const count = (v: string): number => all.filter((a) => a.verdict === v).length;
  const report = {
    tool: 'opensyber-mcp-watch',
    generatedAt,
    summary: {
      servers: results.length,
      suspicious: count('suspicious-injection'),
      versionBump: count('version-bump'),
      firstSeen: count('first-seen'),
      unchanged: count('unchanged'),
      errors: results.filter((r) => r.error).length,
    },
    servers: results.map((r) => ({
      name: r.serverName,
      server: r.serverUrl,
      error: r.error ?? null,
      ...(r.cloudPush ? { cloudPush: r.cloudPush } : {}),
      tools: r.alerts.map((a) => ({
        tool: a.toolName,
        verdict: a.verdict,
        reason: a.reason,
        oldFingerprint: a.oldFingerprint,
        newFingerprint: a.newFingerprint,
        diff: a.diffSummary,
      })),
    })),
  };
  return JSON.stringify(report, null, 2);
}
