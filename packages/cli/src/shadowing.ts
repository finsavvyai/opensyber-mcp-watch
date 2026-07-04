import type { ScanResult } from './watcher.js';

export interface Shadow {
  name: string;
  servers: string[];
}

/**
 * Tool shadowing: the same tool name exposed by more than one server. An agent
 * can be tricked into calling the attacker's `search` instead of the real one.
 * Prompts/resources (namespaced with a ':') are excluded.
 */
export function detectShadowing(results: ScanResult[]): Shadow[] {
  const byName = new Map<string, Set<string>>();
  for (const r of results) {
    if (r.error) continue;
    for (const a of r.alerts) {
      if (a.toolName.includes(':')) continue; // skip prompt:/resource: entries
      const servers = byName.get(a.toolName) ?? new Set<string>();
      servers.add(r.serverName);
      byName.set(a.toolName, servers);
    }
  }
  const shadows: Shadow[] = [];
  for (const [name, servers] of byName) {
    if (servers.size > 1) shadows.push({ name, servers: [...servers].sort() });
  }
  return shadows.sort((a, b) => a.name.localeCompare(b.name));
}
