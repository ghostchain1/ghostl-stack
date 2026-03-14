// SIN — Liquidity Policy Engine
// Analyses per-layer liquidity distribution across GhostChain L1 / L2 / L3
// and recommends cross-layer routing to maintain sovereign policy targets.
// DETECT-AND-PROPOSE only; humans ratify every reallocation.

import { randomUUID }   from 'crypto';
import { API_BASE }     from '../config/sinConfig.js';
import { SIN_RULES }    from '../config/sinRules.js';
import type { LiquidityPolicyResult, LiquidityRoute } from '../types.js';

interface LayerMetrics {
  tvl?:             number | string;
  totalValueLocked?: number | string;
  liquidity?:       number | string;
}

async function fetchLayerTvl(layer: 'l1' | 'l2' | 'l3'): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/api/chains/${layer}/metrics`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return 0;
    const d = await res.json() as LayerMetrics;
    const raw = d.tvl ?? d.totalValueLocked ?? d.liquidity ?? 0;
    return typeof raw === 'string' ? parseFloat(raw) : (raw as number);
  } catch {
    return 0;
  }
}

export async function analyseLiquidity(): Promise<LiquidityPolicyResult> {
  const analysedAt = Date.now();

  const [l1Tvl, l2Tvl, l3Tvl] = await Promise.all([
    fetchLayerTvl('l1'),
    fetchLayerTvl('l2'),
    fetchLayerTvl('l3'),
  ]);

  const total = l1Tvl + l2Tvl + l3Tvl;
  const routes: LiquidityRoute[] = [];

  if (total <= 0) {
    // Metrics unavailable — return neutral state, no routing needed
    return { l1LiquidityPct: 0, l2LiquidityPct: 0, l3LiquidityPct: 0, routes, analysedAt };
  }

  const l1Pct = (l1Tvl / total) * 100;
  const l2Pct = (l2Tvl / total) * 100;
  const l3Pct = (l3Tvl / total) * 100;

  // L1 below minimum → pull from L2 or L3
  if (l1Pct < SIN_RULES.minL1LiquidityPct) {
    const deficitWei = BigInt(Math.round((SIN_RULES.minL1LiquidityPct / 100 - l1Pct / 100) * total * 1e18));
    const source: 'L2' | 'L3' = l2Pct > SIN_RULES.minL2LiquidityPct ? 'L2' : 'L3';
    routes.push({
      id: randomUUID(),
      from: source,
      to: 'L1',
      amountGst: deficitWei.toString(),
      reason: `L1 liquidity at ${l1Pct.toFixed(1)}% — below sovereign floor of ${SIN_RULES.minL1LiquidityPct}%`,
    });
  }

  // L2 below minimum → route excess L3 liquidity to L2
  if (l2Pct < SIN_RULES.minL2LiquidityPct && l3Pct > SIN_RULES.maxL3LiquidityPct) {
    const deficitWei = BigInt(Math.round((SIN_RULES.minL2LiquidityPct / 100 - l2Pct / 100) * total * 1e18));
    routes.push({
      id: randomUUID(),
      from: 'L3',
      to: 'L2',
      amountGst: deficitWei.toString(),
      reason: `L2 at ${l2Pct.toFixed(1)}% (floor ${SIN_RULES.minL2LiquidityPct}%); L3 at ${l3Pct.toFixed(1)}% exceeds cap of ${SIN_RULES.maxL3LiquidityPct}%`,
    });
  }

  // L3 above cap → route excess to L1
  if (l3Pct > SIN_RULES.maxL3LiquidityPct && routes.length === 0) {
    const excessWei = BigInt(Math.round((l3Pct / 100 - SIN_RULES.maxL3LiquidityPct / 100) * total * 1e18));
    routes.push({
      id: randomUUID(),
      from: 'L3',
      to: 'L1',
      amountGst: excessWei.toString(),
      reason: `L3 liquidity at ${l3Pct.toFixed(1)}% — exceeds sovereign cap of ${SIN_RULES.maxL3LiquidityPct}%`,
    });
  }

  return { l1LiquidityPct: l1Pct, l2LiquidityPct: l2Pct, l3LiquidityPct: l3Pct, routes, analysedAt };
}
