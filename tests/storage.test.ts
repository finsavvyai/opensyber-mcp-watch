import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/storage.js';

let dir: string;
let dbPath: string;
let storage: Storage;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mcp-watch-test-'));
  dbPath = join(dir, 'test.db');
  storage = new Storage(dbPath);
});

afterEach(() => {
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('Storage', () => {
  it('upserts and retrieves current fingerprint', () => {
    const now = Date.now();
    storage.upsertCurrent({
      serverUrl: 'http://x',
      toolName: 'weather',
      fingerprint: 'aaa',
      description: 'd',
      inputSchema: '{}',
      firstSeen: now,
      lastSeen: now,
    });
    const got = storage.getCurrent('http://x', 'weather');
    expect(got?.fingerprint).toBe('aaa');
  });

  it('updates fingerprint on conflict', () => {
    const now = Date.now();
    const base = { serverUrl: 'http://x', toolName: 'w', fingerprint: 'a', description: 'd1', inputSchema: '{}', firstSeen: now, lastSeen: now };
    storage.upsertCurrent(base);
    storage.upsertCurrent({ ...base, fingerprint: 'b', description: 'd2', lastSeen: now + 100 });
    const got = storage.getCurrent('http://x', 'w');
    expect(got?.fingerprint).toBe('b');
    expect(got?.description).toBe('d2');
    expect(got?.firstSeen).toBe(now);
  });

  it('appends history rows', () => {
    const now = Date.now();
    storage.appendHistory({ serverUrl: 'http://x', toolName: 'w', fingerprint: 'a', canonicalPayload: '{}', observedAt: now });
    storage.appendHistory({ serverUrl: 'http://x', toolName: 'w', fingerprint: 'b', canonicalPayload: '{}', observedAt: now + 1 });
    const rows = storage.history('http://x', 'w');
    expect(rows).toHaveLength(2);
    expect(rows[0].fingerprint).toBe('b');
  });

  it('prunes rows older than 7 days', () => {
    const now = Date.now();
    const old = now - 8 * 24 * 60 * 60 * 1000;
    storage.appendHistory({ serverUrl: 'http://x', toolName: 'w', fingerprint: 'old', canonicalPayload: '{}', observedAt: old });
    storage.appendHistory({ serverUrl: 'http://x', toolName: 'w', fingerprint: 'new', canonicalPayload: '{}', observedAt: now });
    const pruned = storage.prune(now);
    expect(pruned).toBeGreaterThanOrEqual(1);
    const rows = storage.history('http://x', 'w');
    expect(rows.find((r) => r.fingerprint === 'old')).toBeUndefined();
    expect(rows.find((r) => r.fingerprint === 'new')).toBeDefined();
  });

  it('records drift events', () => {
    const now = Date.now();
    storage.appendDriftEvent({
      serverUrl: 'http://x', toolName: 'w',
      oldFingerprint: 'a', newFingerprint: 'b',
      detectedAt: now, diffSummary: '+ APPENDED: [SYSTEM]',
    });
    const events = storage.driftEvents('http://x', 'w');
    expect(events).toHaveLength(1);
    expect(events[0].diffSummary).toContain('[SYSTEM]');
  });
});
