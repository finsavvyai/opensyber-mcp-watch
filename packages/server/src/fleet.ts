/**
 * Fleet baseline analysis — the cross-machine signal a single agent cannot see.
 *
 * Within an org, the same (server, tool) should present the same fingerprint to
 * every agent. A targeted rug-pull hits ONE agent first, so the disagreeing
 * agent is the tell. This is pure and dependency-free so it is trivially tested.
 */
export interface FleetEntry {
  agentExternalId: string;
  fingerprint: string;
}

export interface FleetAnalysis {
  agentCount: number;
  /** The fingerprint the majority agrees on, or null when there is no consensus. */
  consensusFingerprint: string | null;
  /** True when `thisAgent` disagrees with a real consensus. */
  divergent: boolean;
  /** Every agent whose fingerprint differs from the consensus. */
  divergentAgents: string[];
}

const NONE = (agentCount: number): FleetAnalysis => ({
  agentCount,
  consensusFingerprint: null,
  divergent: false,
  divergentAgents: [],
});

export function analyzeFleet(entries: FleetEntry[], thisAgent: string): FleetAnalysis {
  const agentCount = entries.length;
  // Need at least two agents before "consensus" means anything.
  if (agentCount < 2) return NONE(agentCount);

  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.fingerprint, (counts.get(e.fingerprint) ?? 0) + 1);

  let consensus: string | null = null;
  let max = 0;
  for (const [fp, n] of counts) {
    if (n > max) {
      max = n;
      consensus = fp;
    }
  }
  // Require ≥2 agents to actually agree, so a 1-vs-1 split never flags anyone.
  if (max < 2 || consensus === null) return NONE(agentCount);

  const divergentAgents = entries.filter((e) => e.fingerprint !== consensus).map((e) => e.agentExternalId);
  const thisEntry = entries.find((e) => e.agentExternalId === thisAgent);
  const divergent = thisEntry !== undefined && thisEntry.fingerprint !== consensus;
  return { agentCount, consensusFingerprint: consensus, divergent, divergentAgents };
}
