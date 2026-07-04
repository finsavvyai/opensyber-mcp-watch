import { describe, it, expect } from 'vitest';
import { takeSnapshot } from '../src/snapshot.js';

const okBody = {
  jsonrpc: '2.0',
  id: 1,
  result: { tools: [{ name: 'search', description: 'search the web', inputSchema: { type: 'object' } }] },
};

const fetchImpl = (async (url: string) =>
  url.includes('bad')
    ? new Response('nope', { status: 500 })
    : new Response(JSON.stringify(okBody), { status: 200 })) as unknown as typeof fetch;

describe('takeSnapshot', () => {
  it('fingerprints reachable servers and records unreachable ones as errors', async () => {
    const records = await takeSnapshot(
      [
        { name: 'good', url: 'http://good/mcp' },
        { name: 'down', url: 'http://bad/mcp' },
      ],
      { runAt: 42, fetchImpl },
    );
    const tool = records.find((r) => r.serverName === 'good');
    expect(tool).toMatchObject({ toolName: 'search', runAt: 42 });
    expect(tool!.fingerprint).toMatch(/^[0-9a-f]{64}$/);

    const err = records.find((r) => r.serverName === 'down');
    expect(err!.error).toContain('500');
    expect(err!.toolName).toBeUndefined();
  });
});
