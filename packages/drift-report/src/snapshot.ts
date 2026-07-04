import { fingerprintTool, canonicalJson } from '@opensyber/mcp-watch-core';
import { fetchToolsList } from './fetch.js';
import type { ServerEntry, SnapshotRecord } from './types.js';

export interface SnapshotOpts {
  runAt: number;
  fetchImpl?: typeof globalThis.fetch;
}

/** Fetch every server once and produce the rows for this run. Never throws. */
export async function takeSnapshot(servers: ServerEntry[], opts: SnapshotOpts): Promise<SnapshotRecord[]> {
  const records: SnapshotRecord[] = [];
  for (const server of servers) {
    try {
      const tools = await fetchToolsList(server.url, { headers: server.headers, fetchImpl: opts.fetchImpl });
      for (const tool of tools) {
        records.push({
          runAt: opts.runAt,
          serverName: server.name,
          serverUrl: server.url,
          toolName: tool.name,
          fingerprint: await fingerprintTool(tool),
          description: tool.description,
          inputSchema: canonicalJson(tool.inputSchema),
        });
      }
    } catch (err) {
      records.push({
        runAt: opts.runAt,
        serverName: server.name,
        serverUrl: server.url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return records;
}
