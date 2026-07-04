import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SnapshotRecord } from './types.js';

/** Snapshots persist as append-only JSON Lines so a 7-day watch just keeps appending. */
export function readRecords(path: string): SnapshotRecord[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SnapshotRecord);
}

export function appendRecords(path: string, records: SnapshotRecord[]): void {
  if (records.length === 0) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}
