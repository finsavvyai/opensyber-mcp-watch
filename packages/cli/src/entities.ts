import type { ToolDef } from '@opensyber/mcp-watch-core';

export type EntityKind = 'tool' | 'prompt' | 'resource';

/** A fingerprintable MCP surface: a tool, a prompt, or a resource. */
export interface Entity {
  kind: EntityKind;
  /** tool/prompt name, or resource uri */
  name: string;
  description: string;
  /** the canonical object that gets fingerprinted */
  value: unknown;
}

export function toolToEntity(t: ToolDef): Entity {
  return {
    kind: 'tool',
    name: t.name,
    description: t.description ?? '',
    // Keep the exact shape fingerprintTool uses, so tool fingerprints are stable.
    value: { name: t.name, description: t.description, inputSchema: t.inputSchema },
  };
}

export function promptToEntity(p: Record<string, unknown>): Entity {
  return { kind: 'prompt', name: String(p.name ?? ''), description: String(p.description ?? ''), value: p };
}

export function resourceToEntity(r: Record<string, unknown>): Entity {
  return { kind: 'resource', name: String(r.uri ?? r.name ?? ''), description: String(r.description ?? ''), value: r };
}

/** Storage key suffix — prompts/resources are namespaced so they can't collide with tools. */
export function entityStorageName(e: Entity): string {
  return e.kind === 'tool' ? e.name : `${e.kind}:${e.name}`;
}
