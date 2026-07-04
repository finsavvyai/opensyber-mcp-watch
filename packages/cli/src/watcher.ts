import type { WatchConfig, ServerConfig, CloudConfig } from './config.js';
import { resolveCloud, resolveWebhooks, serverKey } from './config.js';
import { fetchEntities } from './transport.js';
import { entityStorageName } from './entities.js';
import { sendWebhookAlerts, interestingAlerts } from './webhook.js';
import { fingerprintValue, canonicalJson, classifyDrift } from '@opensyber/mcp-watch-core';
import type { DriftAlert } from './alert.js';
import { formatAlertForConsole } from './alert.js';
import { pushObservations, type CloudObservation, type CloudPushResult } from './cloud-client.js';
import { Storage } from './storage.js';
import { c, timestamp } from './output.js';

export interface ScanResult {
  serverName: string;
  serverUrl: string;
  alerts: DriftAlert[];
  error?: string;
  cloudPush?: CloudPushResult;
}

export async function scanOnce(
  storage: Storage,
  server: ServerConfig,
  cloud: CloudConfig | null = null,
): Promise<ScanResult> {
  const alerts: DriftAlert[] = [];
  const observations: CloudObservation[] = [];
  const key = serverKey(server);
  try {
    const entities = await fetchEntities(server);
    const now = Date.now();
    for (const entity of entities) {
      const fp = await fingerprintValue(entity.value);
      const canonicalPayload = canonicalJson(entity.value);
      const name = entityStorageName(entity);
      const prior = storage.getCurrent(key, name);
      const drift = classifyDrift({
        oldFingerprint: prior?.fingerprint ?? null,
        newFingerprint: fp,
        oldDescription: prior?.description ?? '',
        newDescription: entity.description,
        oldInputSchema: prior?.inputSchema ?? '',
        newInputSchema: canonicalPayload,
      });
      alerts.push({
        serverName: server.name,
        serverUrl: key,
        toolName: name,
        verdict: drift.verdict,
        reason: drift.reason,
        oldFingerprint: prior?.fingerprint ?? null,
        newFingerprint: fp,
        diffSummary: drift.diffSummary,
        observedAt: now,
      });

      storage.upsertCurrent({
        serverUrl: key,
        toolName: name,
        fingerprint: fp,
        description: entity.description,
        inputSchema: canonicalPayload,
        firstSeen: prior?.firstSeen ?? now,
        lastSeen: now,
      });
      storage.appendHistory({ serverUrl: key, toolName: name, fingerprint: fp, canonicalPayload, observedAt: now });
      if (drift.verdict === 'suspicious-injection' || drift.verdict === 'version-bump') {
        storage.appendDriftEvent({
          serverUrl: key,
          toolName: name,
          oldFingerprint: prior?.fingerprint ?? '',
          newFingerprint: fp,
          detectedAt: now,
          diffSummary: drift.diffSummary,
        });
      }
      // Only tools flow to the cloud — its ingest recomputes a tool-shaped fingerprint.
      if (entity.kind === 'tool') {
        const v = entity.value as { inputSchema?: unknown };
        observations.push({ toolName: entity.name, fingerprint: fp, description: entity.description, inputSchema: v.inputSchema });
      }
    }
    storage.prune(now);
    let cloudPush: CloudPushResult | undefined;
    if (cloud && observations.length > 0) {
      cloudPush = await pushObservations(cloud, server, observations, { observedAt: now });
    }
    return { serverName: server.name, serverUrl: key, alerts, ...(cloudPush ? { cloudPush } : {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { serverName: server.name, serverUrl: key, alerts, error: message };
  }
}

export interface WatchHandle {
  stop: () => void;
}

export function watchLoop(
  storage: Storage,
  cfg: WatchConfig,
  intervalMs: number = cfg.interval_ms,
  onAlerts: (results: ScanResult[]) => void = defaultOnAlerts,
): WatchHandle {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const cloud = resolveCloud(cfg);
  const webhooks = resolveWebhooks(cfg);

  const tick = async (): Promise<void> => {
    if (stopped) return;
    const results = await Promise.all(cfg.servers.map((s) => scanOnce(storage, s, cloud)));
    if (!stopped) onAlerts(results);
    if (!stopped && webhooks.length > 0) {
      const alerts = interestingAlerts(results.flatMap((r) => r.alerts));
      if (alerts.length > 0) void sendWebhookAlerts(webhooks, alerts);
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };

  void tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

function defaultOnAlerts(results: ScanResult[]): void {
  const ts = timestamp(Date.now());
  for (const r of results) {
    if (r.error) {
      process.stdout.write(`${c.warn(`[scan failed]`)} ${c.dim(ts)} ${r.serverName} — ${r.error}\n`);
      continue;
    }
    const interesting = r.alerts.filter(
      (a) => a.verdict === 'suspicious-injection' || a.verdict === 'version-bump' || a.verdict === 'first-seen',
    );
    if (interesting.length === 0) {
      process.stdout.write(
        `${c.ok('[ok]')} ${c.dim(ts)} ${r.serverName} — ${r.alerts.length} surfaces unchanged${cloudSuffix(r)}\n`,
      );
      continue;
    }
    for (const a of interesting) {
      process.stdout.write(formatAlertForConsole(a) + '\n\n');
    }
  }
}

function cloudSuffix(r: ScanResult): string {
  if (!r.cloudPush) return '';
  return r.cloudPush.ok
    ? c.dim(` · cloud ✓${r.cloudPush.suspicious ? ` (${r.cloudPush.suspicious} flagged)` : ''}`)
    : c.warn(` · cloud ✗ ${r.cloudPush.error ?? ''}`);
}
