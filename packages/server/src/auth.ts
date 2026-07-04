import { createHash } from 'node:crypto';

/** API keys are stored only as SHA-256 hashes; the raw key is shown to the user once. */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
}
