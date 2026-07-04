import { describe, it, expect } from 'vitest';
import { analyzeFleet, type FleetEntry } from '../src/fleet.js';

const e = (agent: string, fp: string): FleetEntry => ({ agentExternalId: agent, fingerprint: fp });

describe('analyzeFleet', () => {
  it('does not flag with fewer than two agents', () => {
    expect(analyzeFleet([e('a', 'X')], 'a').divergent).toBe(false);
  });

  it('does not flag when everyone agrees', () => {
    const r = analyzeFleet([e('a', 'X'), e('b', 'X')], 'b');
    expect(r.consensusFingerprint).toBe('X');
    expect(r.divergent).toBe(false);
  });

  it('does not flag a 1-vs-1 split (no real consensus)', () => {
    const r = analyzeFleet([e('a', 'X'), e('b', 'Y')], 'b');
    expect(r.consensusFingerprint).toBeNull();
    expect(r.divergent).toBe(false);
  });

  it('flags the outlier when a majority agrees', () => {
    const entries = [e('a', 'X'), e('b', 'X'), e('c', 'Y')];
    const outlier = analyzeFleet(entries, 'c');
    expect(outlier.consensusFingerprint).toBe('X');
    expect(outlier.divergent).toBe(true);
    expect(outlier.divergentAgents).toEqual(['c']);
    // a majority member is not flagged
    expect(analyzeFleet(entries, 'a').divergent).toBe(false);
  });
});
