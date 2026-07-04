import { describe, it, expect, vi } from 'vitest';
import { formatScanJson } from '../src/report-json.js';
import { sendWebhookAlerts, interestingAlerts, summaryText } from '../src/webhook.js';
import type { DriftAlert } from '../src/alert.js';
import type { ScanResult } from '../src/watcher.js';

const alert = (tool: string, verdict: DriftAlert['verdict']): DriftAlert => ({
  serverName: 'A',
  serverUrl: 'http://a',
  toolName: tool,
  verdict,
  reason: `reason for ${verdict}`,
  oldFingerprint: 'old',
  newFingerprint: 'new',
  diffSummary: 'diff',
  observedAt: 1,
});

describe('formatScanJson', () => {
  it('summarizes verdicts and lists tools per server', () => {
    const results: ScanResult[] = [
      { serverName: 'A', serverUrl: 'http://a', alerts: [alert('t1', 'suspicious-injection'), alert('t2', 'unchanged')] },
      { serverName: 'B', serverUrl: 'http://b', alerts: [], error: 'down' },
    ];
    const json = JSON.parse(formatScanJson(results, 123));
    expect(json.generatedAt).toBe(123);
    expect(json.summary).toMatchObject({ servers: 2, suspicious: 1, unchanged: 1, errors: 1 });
    expect(json.servers[0].tools).toHaveLength(2);
    expect(json.servers[1].error).toBe('down');
  });
});

describe('interestingAlerts', () => {
  it('keeps only suspicious + version-bump', () => {
    const kept = interestingAlerts([alert('a', 'suspicious-injection'), alert('b', 'unchanged'), alert('c', 'version-bump')]);
    expect(kept.map((a) => a.toolName)).toEqual(['a', 'c']);
  });
});

describe('sendWebhookAlerts', () => {
  const alerts = [alert('search', 'suspicious-injection')];

  it('formats Slack, Discord and generic payloads', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    const res = await sendWebhookAlerts(
      [
        { url: 'https://hooks/slack', type: 'slack' },
        { url: 'https://hooks/discord', type: 'discord' },
        { url: 'https://hooks/generic', type: 'generic' },
      ],
      alerts,
      { fetchImpl },
    );
    expect(res.every((r) => r.ok)).toBe(true);
    expect(calls[0].body.text).toContain('suspicious-injection');
    expect(calls[1].body.content).toContain('suspicious-injection');
    expect((calls[2].body.alerts as unknown[]).length).toBe(1);
  });

  it('does nothing when there are no alerts', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await sendWebhookAlerts([{ url: 'https://h', type: 'slack' }], [], { fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a failing webhook without throwing', async () => {
    const fetchImpl = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    const res = await sendWebhookAlerts([{ url: 'https://h', type: 'generic' }], alerts, { fetchImpl });
    expect(res[0].ok).toBe(false);
    expect(res[0].error).toContain('500');
  });

  it('summaryText lists each alert', () => {
    expect(summaryText(alerts)).toContain('A/search');
  });
});
