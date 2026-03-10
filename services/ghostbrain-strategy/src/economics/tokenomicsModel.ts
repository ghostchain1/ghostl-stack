/**
 * Tokenomics Model (Phase 88)
 *
 * Models GST economics:
 *   - Circulating supply vs locked supply
 *   - Burn rate vs inflation rate
 *   - Staking APR sustainability
 *   - Recommendations submitted through governance when burn adjustment needed
 *
 * Source: GhostStack BFF /api/econ/tokenomics
 * Fallback: hardcoded genesis-epoch defaults (governance-locked parameters)
 */

import type { TokenomicsSnapshot } from '../types.js';
import { GHOSTSTACK_API_BASE, TARGETS } from '../config/strategyTargets.js';

interface EconResponse {
  totalSupply?:    number;
  circulatingPct?: number;
  burnRateAnnual?: number;
  stakingAPR?:     number;
}

export async function modelTokenomics(): Promise<TokenomicsSnapshot> {
  const ts = new Date().toISOString();

  // Governance-locked genesis defaults
  let supply          = 1_000_000_000;   // 1 billion GST
  let circulatingPct  = 45;
  let burnRate        = 2.3;
  let stakingAPR      = 12;

  try {
    const r = await globalThis.fetch(`${GHOSTSTACK_API_BASE}/api/econ/tokenomics`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (r.ok) {
      const body = await r.json() as EconResponse;
      supply         = body.totalSupply    ?? supply;
      circulatingPct = body.circulatingPct ?? circulatingPct;
      burnRate       = body.burnRateAnnual ?? burnRate;
      stakingAPR     = body.stakingAPR     ?? stakingAPR;
    }
  } catch {
    /* econ API offline — use governance-locked defaults */
  }

  // Net inflation: staking rewards minus burn
  const rewardEmission = (stakingAPR / 100) * (circulatingPct / 100);
  const inflationRate  = Math.max(0, rewardEmission - burnRate / 100);

  // Recommend burn increase if inflation exceeds target
  const burnRecommended = inflationRate > TARGETS.maxInflationRate / 100;
  let burnDeltaRec: number | undefined;
  if (burnRecommended) {
    // Recommend increasing burn to close the inflation gap
    burnDeltaRec = parseFloat((inflationRate - TARGETS.maxInflationRate / 100 + 0.005).toFixed(3));
    console.info(`[tokenomicsModel] GST supply inflation rising — recommend burn increase +${burnDeltaRec}%`);
  }

  return {
    supply,
    circulatingPct,
    burnRate,
    stakingAPR,
    inflationRate: parseFloat((inflationRate * 100).toFixed(3)),
    burnRecommended,
    burnDeltaRec,
    ts,
  };
}
