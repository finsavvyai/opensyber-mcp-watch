import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { fetchToolsListStdio } from '../src/stdio-client.js';
import { fetchTools } from '../src/transport.js';

const fixture = fileURLToPath(new URL('./fixtures/stdio-mcp-server.mjs', import.meta.url));
const stdioServer = { name: 'fx', command: process.execPath, args: [fixture] };

describe('stdio transport', () => {
  it('speaks initialize + tools/list over stdio (ignoring non-JSON log lines)', async () => {
    const tools = await fetchToolsListStdio(stdioServer, { timeoutMs: 5000 });
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('echo');
  });

  it('is dispatched by fetchTools when a command is configured', async () => {
    const tools = await fetchTools(stdioServer);
    expect(tools.map((t) => t.name)).toContain('echo');
  });

  it('rejects when the command cannot be spawned', async () => {
    await expect(
      fetchToolsListStdio({ name: 'bad', command: 'no-such-binary-xyzzy', args: [] }, { timeoutMs: 3000 }),
    ).rejects.toThrow();
  });
});
