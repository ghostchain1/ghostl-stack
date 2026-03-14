// Inter-chain Coordinator — aggregates cross-chain AI signals (L3 → L2 → L1 routing law)

import { API_BASE, CHAIN } from '../config/planetConfig.js';
import type { ChainId, InterchainMessage, PlanetProposal } from '../types.js';
import { randomUUID } from 'crypto';

interface ChainMetricsEntry {
  chainId?: number;
  tps?: number;
  pendingTxs?: number;
  gasPrice?: string;
  blockTime?: number;
}

interface CoordinationSignal {
  sourceChain: ChainId;
  topic: string;
  severity: 'info' | 'warning' | 'critical';
  payload: Record<string, unknown>;
}

async function fetchChainMetrics(chainId: ChainId): Promise<ChainMetricsEntry | null> {
  const pathMap: Record<number, string> = {
    [CHAIN.L1]: '/api/chains/l1/metrics',
    [CHAIN.L2]: '/api/chains/l2/metrics',
    [CHAIN.L3]: '/api/chains/l3/metrics',
  };
  try {
    const res = await fetch(`${API_BASE}${pathMap[chainId]}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) return (await res.json()) as ChainMetricsEntry;
  } catch {
    // unavailable
  }
  return null;
}

export async function gatherInterchainSignals(): Promise<InterchainMessage[]> {
  const chainIds: ChainId[] = [CHAIN.L3, CHAIN.L2, CHAIN.L1];
  const results = await Promise.allSettled(chainIds.map(fetchChainMetrics));

  const signals: CoordinationSignal[] = [];

  for (let i = 0; i < chainIds.length; i++) {
    const result = results[i];
    const cid    = chainIds[i] as ChainId;
    if (result?.status !== 'fulfilled' || !result.value) continue;

    const m = result.value;
    if ((m.pendingTxs ?? 0) > 10_000) {
      signals.push({
        sourceChain: cid,
        topic:       'tx-congestion',
        severity:    (m.pendingTxs ?? 0) > 50_000 ? 'critical' : 'warning',
        payload:     { pendingTxs: m.pendingTxs, chainId: cid },
      });
    }
    if ((m.blockTime ?? 0) > 15_000) {
      signals.push({
        sourceChain: cid,
        topic:       'slow-block-time',
        severity:    (m.blockTime ?? 0) > 30_000 ? 'critical' : 'warning',
        payload:     { blockTimeMs: m.blockTime, chainId: cid },
      });
    }
  }

  // Routing law: only propagate L3 signals upward (L3 → L2 → L1)
  const messages: InterchainMessage[] = [];
  for (const sig of signals) {
    if (sig.sourceChain === CHAIN.L3) {
      messages.push({ id: randomUUID(), sourceChain: CHAIN.L3, targetChain: CHAIN.L2, topic: sig.topic, payload: sig.payload, createdAt: Date.now() });
      messages.push({ id: randomUUID(), sourceChain: CHAIN.L2, targetChain: CHAIN.L1, topic: sig.topic, payload: sig.payload, createdAt: Date.now() });
    } else if (sig.sourceChain === CHAIN.L2) {
      messages.push({ id: randomUUID(), sourceChain: CHAIN.L2, targetChain: CHAIN.L1, topic: sig.topic, payload: sig.payload, createdAt: Date.now() });
    } else {
      messages.push({ id: randomUUID(), sourceChain: CHAIN.L1, targetChain: CHAIN.L1, topic: sig.topic, payload: sig.payload, createdAt: Date.now() });
    }
  }

  return messages;
}

export function coordinationProposals(
  messages: InterchainMessage[],
  maxProposals: number,
): PlanetProposal[] {
  const urgent = messages.filter((m) =>
    ['tx-congestion', 'slow-block-time'].includes(m.topic),
  );

  return urgent.slice(0, maxProposals).map((m) => ({
    id:          randomUUID(),
    type:        'chain-parameter-update' as const,
    description: `Inter-chain signal on topic "${m.topic}" from chain ${m.sourceChain} → ${m.targetChain}`,
    payload:     { ...m },
    urgency:     'high' as const,
    createdAt:   Date.now(),
    requiresHumanRatification: true as const,
  }));
}
