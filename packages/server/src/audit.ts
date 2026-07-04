/**
 * Tamper-evident audit log — a hash-chained record of detections that an org
 * can prove to a regulator was neither edited nor back-dated.
 *
 * Each entry seals the previous entry's HMAC into its own:
 *   hmac(n) = HMAC-SHA256( hmac(n-1) ‖ canonical(payload(n)), orgKey )
 * Editing or deleting any entry breaks every subsequent hmac, which
 * verifyChain() detects. The per-org key is derived from a server secret so a
 * leaked chain cannot be forged without it.
 */
import { createHmac } from 'node:crypto';
import { canonicalJson } from '@opensyber/mcp-watch-core';

export const GENESIS_HMAC = '0'.repeat(64);

/** Per-org key = HMAC(serverSecret, orgId). Isolates orgs from each other. */
export function deriveOrgKey(serverSecret: string, orgId: string): string {
  return createHmac('sha256', serverSecret).update(orgId).digest('hex');
}

export function chainHmac(prevHmac: string, payload: unknown, key: string): string {
  return createHmac('sha256', key).update(prevHmac + canonicalJson(payload)).digest('hex');
}

export interface VerifiableEntry {
  prevHmac: string;
  payload: unknown;
  hmac: string;
}

export interface ChainVerification {
  valid: boolean;
  /** 0-based index of the first broken entry, or null when the chain is intact. */
  brokenAt: number | null;
}

export function verifyChain(
  entries: VerifiableEntry[],
  key: string,
  genesis: string = GENESIS_HMAC,
): ChainVerification {
  let prev = genesis;
  for (let i = 0; i < entries.length; i++) {
    const en = entries[i];
    if (en.prevHmac !== prev) return { valid: false, brokenAt: i };
    if (chainHmac(en.prevHmac, en.payload, key) !== en.hmac) return { valid: false, brokenAt: i };
    prev = en.hmac;
  }
  return { valid: true, brokenAt: null };
}
