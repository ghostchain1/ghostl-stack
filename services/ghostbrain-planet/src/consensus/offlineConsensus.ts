// Offline Consensus — tracks satellite/offline consensus nodes, estimates consensus impact

import { API_BASE, CHAIN, THRESHOLDS } from '../config/planetConfig.js';
import type { ChainId, ConsensusNode, ConsensusSnapshot } from '../types.js';

interface NodeApiEntry {
  nodeId?: string;
  region?: string;
  type?: string;
  connectivity?: string;
  lastSeenHeight?: number;
  chainId?: number;
}

function chainId(raw: number | undefined): ChainId {
  if (raw === CHAIN.L2) return CHAIN.L2;
  if (raw === CHAIN.L3) return CHAIN.L3;
  return CHAIN.L1;
}

export async function snapshotConsensus(): Promise<ConsensusSnapshot> {
  let entries: NodeApiEntry[] = [];

  for (const path of [
    '/api/nodes/consensus',
    '/api/validators',
    '/api/nodes/inventory',
  ]) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        signal: AbortSignal.timeout(6_000),
      });
      if (res.ok) {
        entries = (await res.json()) as NodeApiEntry[];
        break;
      }
    } catch {
      // try next endpoint
    }
  }

  const nodes: ConsensusNode[] = entries.map((e, i) => {
    const conn =
      e.connectivity === 'offline'
        ? 'offline'
        : e.connectivity === 'intermittent'
          ? 'intermittent'
          : 'online';
    const type =
      e.type === 'satellite'
        ? 'satellite'
        : e.type === 'full'
          ? 'full'
          : e.type === 'observer'
            ? 'observer'
            : 'validator';
    return {
      nodeId:          e.nodeId ?? `node-${i}`,
      regionId:        (e.region ?? 'us-east') as ConsensusNode['regionId'],
      type,
      connectivity:    conn,
      lastSeenHeight:  e.lastSeenHeight ?? 0,
      behindByBlocks:  0, // filled below
      chainId:         chainId(e.chainId),
    };
  });

  // Compute tip per chain, then fill behindByBlocks
  const tipByChain: Partial<Record<ChainId, number>> = {};
  for (const n of nodes) {
    if (n.connectivity === 'online') {
      const prev = tipByChain[n.chainId] ?? 0;
      if (n.lastSeenHeight > prev) tipByChain[n.chainId] = n.lastSeenHeight;
    }
  }
  for (const n of nodes) {
    const tip = tipByChain[n.chainId] ?? 0;
    n.behindByBlocks = Math.max(0, tip - n.lastSeenHeight);
    if (n.behindByBlocks >= THRESHOLDS.nodeOfflineBehindBlocks) {
      n.connectivity = 'offline';
    }
  }

  const total    = nodes.length;
  const online   = nodes.filter((n) => n.connectivity === 'online').length;
  const offline  = nodes.filter((n) => n.connectivity === 'offline').length;
  const satellite = nodes.filter((n) => n.type === 'satellite').length;

  const participation = total ? online / total : 1;

  return {
    totalNodes: total,
    onlineNodes: online,
    offlineNodes: offline,
    satelliteNodes: satellite,
    globalParticipationPct: Math.round(participation * 1000) / 10,
    pendingSyncs: [], // filled by consensusSync
  };
}
