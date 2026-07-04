import { describe, it, expect, vi } from 'vitest';
import { pushObservations, type CloudObservation } from '../src/cloud-client.js';
import { resolveCloud, type WatchConfig, type CloudConfig } from '../src/config.js';

const cloud: CloudConfig = { endpoint: 'https://api.example.com/', api_key: 'k-123', enabled: true };
const server = { name: 'local', url: 'http://localhost:3001/mcp' };
const obs: CloudObservation[] = [
  { toolName: 'search', fingerprint: 'abc', description: 'search', inputSchema: {} },
];

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('pushObservations', () => {
  it('POSTs a batched payload with auth to /v1/ingest', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ accepted: 1, suspicious: 0 }));
    const res = await pushObservations(cloud, server, obs, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      agentId: 'laptop-1',
      observedAt: 42,
    });
    expect(res).toMatchObject({ ok: true, status: 200, accepted: 1, suspicious: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/ingest'); // trailing slash collapsed
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k-123');
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ agentId: 'laptop-1', serverUrl: server.url, observedAt: 42 });
    expect(sent.tools).toHaveLength(1);
  });

  it('does not retry a 4xx', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'bad key' }, 401));
    const res = await pushObservations(cloud, server, obs, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryBaseMs: 0,
    });
    expect(res).toMatchObject({ ok: false, status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx up to the limit then fails', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'boom' }, 503));
    const res = await pushObservations(cloud, server, obs, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retries: 2,
      retryBaseMs: 0,
    });
    expect(res.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('retries a network error then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(jsonResponse({ accepted: 1, suspicious: 1 }));
    const res = await pushObservations(cloud, server, obs, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryBaseMs: 0,
    });
    expect(res).toMatchObject({ ok: true, suspicious: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('resolveCloud', () => {
  const base: WatchConfig = { servers: [], interval_ms: 1, alert_on: [] };

  it('returns null by default (opt-in)', () => {
    expect(resolveCloud(base, {})).toBeNull();
    expect(resolveCloud({ ...base, cloud: { endpoint: 'https://x', api_key: 'k', enabled: false } }, {})).toBeNull();
  });

  it('enables when config cloud.enabled is true', () => {
    const res = resolveCloud({ ...base, cloud: { endpoint: 'https://x', api_key: 'k', enabled: true } }, {});
    expect(res).toMatchObject({ endpoint: 'https://x', api_key: 'k', enabled: true });
  });

  it('env vars are an explicit opt-in that overrides config', () => {
    const res = resolveCloud(base, {
      MCP_WATCH_CLOUD_ENDPOINT: 'https://env.example.com',
      MCP_WATCH_CLOUD_KEY: 'env-key',
    } as NodeJS.ProcessEnv);
    expect(res).toMatchObject({ endpoint: 'https://env.example.com', api_key: 'env-key', enabled: true });
  });
});
