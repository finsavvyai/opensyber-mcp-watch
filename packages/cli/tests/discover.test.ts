import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseClientConfig, candidatePaths, discover, mergeServers } from '../src/discover.js';

describe('parseClientConfig', () => {
  it('parses mcpServers stdio + url entries', () => {
    const servers = parseClientConfig({
      mcpServers: {
        files: { command: 'npx', args: ['-y', 'server-filesystem', '/tmp'] },
        remote: { url: 'https://mcp.example/mcp', headers: { Authorization: 'Bearer x' } },
      },
    });
    expect(servers).toHaveLength(2);
    expect(servers.find((s) => s.name === 'files')).toMatchObject({ command: 'npx', args: ['-y', 'server-filesystem', '/tmp'] });
    expect(servers.find((s) => s.name === 'remote')).toMatchObject({ url: 'https://mcp.example/mcp' });
  });

  it('supports the VS Code "servers" key', () => {
    expect(parseClientConfig({ servers: { a: { url: 'http://x/mcp' } } })).toHaveLength(1);
  });

  it('returns [] for junk', () => {
    expect(parseClientConfig(null)).toEqual([]);
    expect(parseClientConfig({ nope: 1 })).toEqual([]);
  });
});

describe('candidatePaths', () => {
  it('locates Claude Desktop per platform', () => {
    expect(candidatePaths({ platform: 'darwin', home: '/Users/x' })[0].path).toContain('Application Support');
    expect(candidatePaths({ platform: 'linux', home: '/home/x' })[0].path).toContain('.config');
    const win = candidatePaths({ platform: 'win32', home: 'C:\\U', env: { APPDATA: 'C:\\U\\AppData\\Roaming' } as NodeJS.ProcessEnv });
    expect(win[0].path).toContain('Claude');
  });
});

describe('discover + mergeServers', () => {
  it('reads real config files and de-duplicates by name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'disc-'));
    try {
      const p1 = join(dir, 'a.json');
      writeFileSync(p1, JSON.stringify({ mcpServers: { files: { command: 'node', args: ['s.js'] } } }));
      const p2 = join(dir, 'b.json');
      writeFileSync(p2, JSON.stringify({ servers: { remote: { url: 'http://x/mcp' }, files: { command: 'other' } } }));

      const found = discover([
        { client: 'A', path: p1 },
        { client: 'B', path: p2 },
        { client: 'missing', path: join(dir, 'nope.json') },
      ]);
      expect(found).toHaveLength(2);

      const merged = mergeServers([], found.flatMap((f) => f.servers));
      expect(merged.filter((s) => s.name === 'files')).toHaveLength(1); // deduped
      expect(merged.find((s) => s.name === 'files')).toMatchObject({ command: 'node' }); // first wins
      expect(merged.map((s) => s.name).sort()).toEqual(['files', 'remote']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
