export interface ToolDef {
  name: string;
  description: string;
  inputSchema: unknown;
}

export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => [k, canonicalize(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

async function sha256Hex(payload: string): Promise<string> {
  const bytes = new TextEncoder().encode(payload);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 of any value's canonical JSON — used for prompts and resources. */
export async function fingerprintValue(value: unknown): Promise<string> {
  return sha256Hex(canonicalJson(value));
}

export async function fingerprintTool(tool: ToolDef): Promise<string> {
  return fingerprintValue({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  });
}
