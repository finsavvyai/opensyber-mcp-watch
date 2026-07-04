import { describe, it, expect } from 'vitest';
import { parseMcpResponse, fetchToolsList } from '../src/fetch.js';

describe('parseMcpResponse', () => {
  it('parses plain JSON', () => {
    expect(parseMcpResponse('{"result":{"tools":[]}}')).toEqual({ result: { tools: [] } });
  });

  it('parses a Streamable-HTTP SSE data frame', () => {
    const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"t"}]}}\n\n';
    const parsed = parseMcpResponse(sse) as { result: { tools: Array<{ name: string }> } };
    expect(parsed.result.tools[0].name).toBe('t');
  });

  it('throws on garbage', () => {
    expect(() => parseMcpResponse('not a response')).toThrow();
  });
});

describe('fetchToolsList handshake', () => {
  it('runs initialize then tools/list and carries the session id', async () => {
    const calls: Array<{ method: string; session: string | undefined }> = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const msg = JSON.parse(init.body as string) as { method: string };
      const headers = init.headers as Record<string, string>;
      calls.push({ method: msg.method, session: headers['Mcp-Session-Id'] });
      if (msg.method === 'initialize') {
        return new Response('{"result":{}}', { status: 200, headers: { 'Mcp-Session-Id': 'sess-1' } });
      }
      if (msg.method === 'notifications/initialized') return new Response('', { status: 202 });
      return new Response(
        'data: {"result":{"tools":[{"name":"w","description":"d","inputSchema":{}}]}}\n\n',
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const tools = await fetchToolsList('http://x/mcp', { fetchImpl });
    expect(tools[0].name).toBe('w');
    expect(calls.find((c) => c.method === 'tools/list')?.session).toBe('sess-1');
  });

  it('falls back to a bare tools/list when initialize is unsupported', async () => {
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const msg = JSON.parse(init.body as string) as { method: string };
      if (msg.method === 'initialize') return new Response('nope', { status: 405 });
      return new Response('{"result":{"tools":[{"name":"z","description":"d","inputSchema":{}}]}}', { status: 200 });
    }) as unknown as typeof fetch;

    const tools = await fetchToolsList('http://x/mcp', { fetchImpl });
    expect(tools[0].name).toBe('z');
  });
});
