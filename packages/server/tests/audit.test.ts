import { describe, it, expect } from 'vitest';
import { chainHmac, verifyChain, deriveOrgKey, GENESIS_HMAC } from '../src/audit.js';
import { MemoryStore } from '../src/store/memory.js';

describe('audit chain', () => {
  it('verifies an intact chain built by the store', async () => {
    const store = new MemoryStore([], 'secret');
    await store.appendAudit('org', { a: 1 }, 1);
    await store.appendAudit('org', { b: 2 }, 2);
    expect((await store.verifyAudit('org')).valid).toBe(true);
    expect(await store.getAuditChain('org')).toHaveLength(2);
  });

  it('detects tampering and reports where the chain breaks', () => {
    const key = deriveOrgKey('secret', 'org');
    const e1 = { prevHmac: GENESIS_HMAC, payload: { a: 1 }, hmac: chainHmac(GENESIS_HMAC, { a: 1 }, key) };
    const e2 = { prevHmac: e1.hmac, payload: { b: 2 }, hmac: chainHmac(e1.hmac, { b: 2 }, key) };
    expect(verifyChain([e1, e2], key).valid).toBe(true);

    const tampered = [{ ...e1, payload: { a: 999 } }, e2];
    const res = verifyChain(tampered, key);
    expect(res.valid).toBe(false);
    expect(res.brokenAt).toBe(0);
  });

  it('a deleted middle entry breaks the chain', () => {
    const key = deriveOrgKey('secret', 'org');
    const e1 = { prevHmac: GENESIS_HMAC, payload: { n: 1 }, hmac: chainHmac(GENESIS_HMAC, { n: 1 }, key) };
    const e2 = { prevHmac: e1.hmac, payload: { n: 2 }, hmac: chainHmac(e1.hmac, { n: 2 }, key) };
    const e3 = { prevHmac: e2.hmac, payload: { n: 3 }, hmac: chainHmac(e2.hmac, { n: 3 }, key) };
    expect(verifyChain([e1, e3], key).valid).toBe(false); // e2 removed
  });

  it('derives distinct per-org keys', () => {
    expect(deriveOrgKey('s', 'orgA')).not.toBe(deriveOrgKey('s', 'orgB'));
  });
});
