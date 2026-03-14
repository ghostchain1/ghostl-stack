// Consensus Sync — detects re-sync opportunities and generates catch-up proposals

import { randomUUID } from 'crypto';
import { API_BASE, THRESHOLDS } from '../config/planetConfig.js';
import type { PlanetProposal, SyncStatus } from '../types.js';

interface NodeApiEntry {
  nodeId?: string;
  region?: string;
  connectivity?: string;
  lastSeenHeight?: number;
  tipHeight?: number;
  chainId?: number;
}

// Estimate blocks-per-second per chain (conservative)
const BLOCKS_PER_SEC: Record<number, number> = {
  14000101: 1,
  901:      2,
  903:      4,
};

export async function detectPendingSyncs(): Promise<SyncStatus[]> {
  let entries: NodeApiEntry[] = [];

  try {
    const res = await fetch(`${API_BASE}/api/nodes/inventory`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (res.ok) {
      entries = (await res.json()) as NodeApiEntry[];
    }
  } catch {
    return [];
  }

  const syncs: SyncStatus[] = [];

  for (const e of entries) {
    const behind = (e.tipHeight ?? 0) - (e.lastSeenHeight ?? 0);
    if (behind < THRESHOLDS.nodeOfflineBehindBlocks) continue;
    if (e.connectivity !== 'online' && e.connectivity !== 'intermittent') continue;

    const chainId = e.chainId ?? 14000101;
    const bps     = BLOCKS_PER_SEC[chainId] ?? 1;

    syncs.push({
      nodeId:         e.nodeId ?? 'unknown',
      regionId:       (e.region ?? 'us-east') as SyncStatus['regionId'],
      chainId:        chainId as SyncStatus['chainId'],
      reconnected:    e.connectivity === 'online',
      blocksToSync:   behind,
      estimatedSyncMs: Math.round((behind / bps) * 1_000),
    });
  }

  return syncs;
}

export function syncProposals(
  syncs: SyncStatus[],
  maxProposals: number,
): PlanetProposal[] {
  // Prioritise by blocks behind (largest first)
  return syncs
    .sort((a, b) => b.blocksToSync - a.blocksToSync)
    .slice(0, maxProposals)
    .map((s) => ({
      id: randomUUID(),
      type:        'consensus-sync' as const,
      description: `Node ${s.nodeId} (${s.regionId}) is ${s.blocksToSync} blocks behind on chain ${s.chainId} — estimated sync ${Math.round(s.estimatedSyncMs / 1_000)} s`,
      payload:     { ...s },
      urgency:     (s.blocksToSync > 1_000 ? 'critical' : 'high') as PlanetProposal['urgency'],
      createdAt:   Date.now(),
      requiresHumanRatification: true as const,
    }));
}
