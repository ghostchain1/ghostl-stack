// GST Economic Policy Engine — monitors tokenomics, recommends supply-side adjustments
// Produces human-ratified proposals only; never executes mints or burns autonomously.

import { API_BASE, GST_TARGET_INFLATION_PCT, GST_BURN_FLOOR_PCT, GST_ADJUSTMENT_CAP_PCT } from '../config/sinConfig.js';
import type { GstPolicy } from '../types.js';

interface TokenomicsApiResponse {
  totalSupply?:       string;
  circulatingSupply?: string;
  inflationRatePct?:  number;
  burnRatePct?:       number;
  stakingRatioPct?:   number;
}

export async function analyseGstPolicy(): Promise<GstPolicy | null> {
  let data: TokenomicsApiResponse | null = null;

  try {
    const res = await fetch(`${API_BASE}/api/econ/tokenomics`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (res.ok) data = (await res.json()) as TokenomicsApiResponse;
  } catch {
    return null;
  }

  if (!data) return null;

  const inflation = data.inflationRatePct ?? 0;
  const burn      = data.burnRatePct      ?? 0;
  const gap       = inflation - GST_TARGET_INFLATION_PCT;

  let recommendation: GstPolicy['recommendation'];
  let proposedAdjustmentPct: number;
  let rationale: string;

  if (inflation > GST_TARGET_INFLATION_PCT + 1) {
    recommendation        = 'increase-burn';
    proposedAdjustmentPct = Math.min(GST_ADJUSTMENT_CAP_PCT, gap * 0.5);
    rationale = `Inflation ${inflation.toFixed(2)}% exceeds target ${GST_TARGET_INFLATION_PCT}% by ${gap.toFixed(2)}pp. Recommend increasing burn rate by ${proposedAdjustmentPct.toFixed(2)}pp to counter-balance issuance.`;
  } else if (inflation < GST_TARGET_INFLATION_PCT - 1 && burn > GST_BURN_FLOOR_PCT + 1) {
    recommendation        = 'decrease-issuance';
    proposedAdjustmentPct = -Math.min(GST_ADJUSTMENT_CAP_PCT, Math.abs(gap) * 0.5);
    rationale = `Inflation ${inflation.toFixed(2)}% below target. Burn rate ${burn.toFixed(2)}% is above floor. Recommend reducing issuance slightly to preserve healthy inflation floor.`;
  } else if (inflation < GST_TARGET_INFLATION_PCT - 2) {
    recommendation        = 'increase-issuance';
    proposedAdjustmentPct = Math.min(GST_ADJUSTMENT_CAP_PCT, Math.abs(gap) * 0.5);
    rationale = `Inflation critically below target (${inflation.toFixed(2)}%). Validator staking incentives may be insufficient. Recommend modest issuance increase.`;
  } else {
    recommendation        = 'stable';
    proposedAdjustmentPct = 0;
    rationale = `GST inflation at ${inflation.toFixed(2)}% — within ±1pp of ${GST_TARGET_INFLATION_PCT}% target. No adjustment recommended this cycle.`;
  }

  return {
    currentSupply:         data.totalSupply       ?? '0',
    circulatingSupply:     data.circulatingSupply  ?? '0',
    inflationRatePct:      inflation,
    targetInflationPct:    GST_TARGET_INFLATION_PCT,
    burnRatePct:           burn,
    recommendation,
    rationale,
    proposedAdjustmentPct: Math.round(proposedAdjustmentPct * 1000) / 1000,
  };
}
