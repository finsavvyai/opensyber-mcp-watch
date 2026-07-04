import { hostname } from 'node:os';
import type { CloudConfig, ServerConfig } from './config.js';

export interface CloudObservation {
  toolName: string;
  fingerprint: string;
  description: string;
  inputSchema: unknown;
}

export interface CloudPushResult {
  ok: boolean;
  status?: number;
  accepted?: number;
  suspicious?: number;
  error?: string;
}

type FetchLike = typeof globalThis.fetch;

export interface PushOptions {
  observedAt?: number;
  agentId?: string;
  fetchImpl?: FetchLike;
  /** Number of RETRIES after the first attempt (network + 5xx only). */
  retries?: number;
  /** Base backoff in ms; doubles each retry, capped at 16s. Tests pass 0. */
  retryBaseMs?: number;
  timeoutMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Push one server scan's observations to the cloud ingest API. Batched (one
 * request per scan). Retries network failures and 5xx with exponential backoff;
 * 4xx are returned without retry. Never throws — returns a result either way,
 * so a cloud outage cannot break local watching.
 */
export async function pushObservations(
  cloud: CloudConfig,
  server: ServerConfig,
  observations: CloudObservation[],
  opts: PushOptions = {},
): Promise<CloudPushResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const retries = opts.retries ?? 3;
  const retryBaseMs = opts.retryBaseMs ?? 2000;
  const url = cloud.endpoint.replace(/\/+$/, '') + '/v1/ingest';
  const body = JSON.stringify({
    agentId: opts.agentId ?? hostname(),
    serverUrl: server.url,
    observedAt: opts.observedAt ?? Date.now(),
    tools: observations,
  });

  let lastErr = 'unknown error';
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(retryBaseMs * 2 ** (attempt - 1), 16_000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cloud.api_key}`,
        },
        body,
        signal: controller.signal,
      });
      if (res.status >= 500) {
        lastErr = `HTTP ${res.status}`;
        continue; // retry server errors
      }
      if (!res.ok) {
        return { ok: false, status: res.status, error: `HTTP ${res.status}` }; // 4xx: no retry
      }
      const data = (await res.json()) as { accepted?: number; suspicious?: number };
      return { ok: true, status: res.status, accepted: data.accepted, suspicious: data.suspicious };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastErr };
}
