/**
 * Gas Forecast (Phase 86)
 *
 * Reads the gas-engine telemetry from the GhostStack BFF and produces a
 * forward gas-price forecast for L1/L2/L3.
 *
 * Enables AI gas optimization strategies:
 *   - Advising the sequencer on batch size
 *   - Recommending fee-market parameter adjustments for governance
 *
 * DETECT-ONLY — no writes.
 */

import type { ForecastResult, RiskLevel } from '../types.js';
import { GHOSTSTACK_API_BASE, TARGETS } from '../config/strategyTargets.js';

interface GasEngineStatus {
  l1GasGwei?:   number;
  l2GasGwei?:   number;
  l3GasGwei?:   number;
  surgeActive?: boolean;
  ts?:          string;
}

function riskFromGas(gas: number): RiskLevel {
  const ratio = gas / (TARGETS.gasTarget || 40);
  if (ratio >= 4) return 'critical';
  if (ratio >= 2.5) return 'high';
  if (ratio >= 1.5) return 'moderate';
  return 'low';
}

export async function gasForecast(): Promise<ForecastResult> {
  const ts  = new Date().toISOString();
  let gasScore = 40;   // normalized 0–100; 40 = at target
  let detail   = 'Gas estimate from synthetic baseline (gas-engine unreachable)';
  let surgeActive = false;

  try {
    const r = await globalThis.fetch(`${GHOSTSTACK_API_BASE}/api/gas-engine/status`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (r.ok) {
      const body     = await r.json() as GasEngineStatus;
      // Average all three layers; prefer L2 as primary execution layer
      const readings = [body.l1GasGwei, body.l2GasGwei, body.l3GasGwei].filter((v): v is number => typeof v === 'number');
      if (readings.length) {
        const avgGwei = readings.reduce((a, b) => a + b, 0) / readings.length;
        // Normalize: target gas = 40 gwei → score 40; 200 gwei → score ~100
        gasScore   = Math.min(Math.round((avgGwei / TARGETS.gasTarget) * 40), 100);
        surgeActive = body.surgeActive ?? false;
        detail     = `L1 ${body.l1GasGwei ?? '?'}g / L2 ${body.l2GasGwei ?? '?'}g / L3 ${body.l3GasGwei ?? '?'}g; ${surgeActive ? 'surge ACTIVE' : 'nominal'}`;
      }
    }
  } catch {
    /* gas engine offline — use baseline */
  }

  const level = riskFromGas(gasScore);

  let recommendation: string | undefined;
  if (level === 'critical' || surgeActive) {
    recommendation = 'Submit governance proposal to expand L2 block-gas limit temporarily';
  } else if (level === 'high') {
    recommendation = 'Increase sequencer batch frequency to reduce per-tx gas overhead';
  } else if (level === 'moderate') {
    recommendation = 'Alert validators; consider EIP-1559 base-fee cap adjustment via governance';
  }

  if (gasScore > 70) {
    console.info(`[gasForecast] Gas surge predicted — score ${gasScore}`);
  }

  return { metric: 'gas_price', value: gasScore, level, detail, recommendation, ts };
}
