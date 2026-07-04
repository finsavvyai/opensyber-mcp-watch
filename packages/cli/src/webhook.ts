import type { WebhookConfig } from './config.js';
import type { DriftAlert } from './alert.js';

export interface WebhookResult {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
}

type FetchLike = typeof globalThis.fetch;

const EMOJI: Record<string, string> = {
  'suspicious-injection': '🔴',
  'version-bump': '🟡',
  'first-seen': '🔵',
  unchanged: '🟢',
};

/** Which verdicts are worth notifying about. */
export function interestingAlerts(alerts: DriftAlert[]): DriftAlert[] {
  return alerts.filter((a) => a.verdict === 'suspicious-injection' || a.verdict === 'version-bump');
}

export function summaryText(alerts: DriftAlert[]): string {
  const lines = alerts.map(
    (a) => `${EMOJI[a.verdict] ?? '•'} [${a.verdict}] ${a.serverName}/${a.toolName} — ${a.reason}`,
  );
  return `mcp-watch: ${alerts.length} drift event(s)\n${lines.join('\n')}`;
}

function payloadFor(webhook: WebhookConfig, alerts: DriftAlert[]): unknown {
  const text = summaryText(alerts);
  switch (webhook.type) {
    case 'slack':
      return { text };
    case 'discord':
      return { content: text };
    default:
      return { source: 'opensyber-mcp-watch', count: alerts.length, alerts };
  }
}

/**
 * POST drift alerts to each webhook (Slack/Discord/generic). Never throws — a
 * webhook outage must not break the watch loop; failures come back as results.
 */
export async function sendWebhookAlerts(
  webhooks: WebhookConfig[],
  alerts: DriftAlert[],
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<WebhookResult[]> {
  if (webhooks.length === 0 || alerts.length === 0) return [];
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  return Promise.all(
    webhooks.map(async (webhook): Promise<WebhookResult> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
      try {
        const res = await fetchImpl(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadFor(webhook, alerts)),
          signal: controller.signal,
        });
        return { url: webhook.url, ok: res.ok, status: res.status, ...(res.ok ? {} : { error: `HTTP ${res.status}` }) };
      } catch (err) {
        return { url: webhook.url, ok: false, error: err instanceof Error ? err.message : String(err) };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}
