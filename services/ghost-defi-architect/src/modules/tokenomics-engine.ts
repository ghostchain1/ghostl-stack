/**
 * tokenomics-engine.ts — Token supply and emission schedule design module.
 *
 * Pure computation — no Solidity generation.
 * Designs token supply curves, emission schedules, burn models, and vesting schedules.
 * All outputs feed into architect-engine for system-level decisions.
 */

import {
  emissionHalving,
  emissionDecay,
  totalEmission,
  aprFromRate,
  apyFromApr,
  simulateSupply,
  type TokenomicsSnapshot,
} from "../math/reward-curves.js";
import {
  collateralRequired,
  sampleCurve,
  type BondingCurveParams,
  type CurvePoint,
} from "../math/bonding-curves.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmissionSchedule = "halving" | "decay" | "linear" | "fixed";
export type BurnModel = "none" | "flat-fee" | "transaction-fee" | "buyback-burn";

export interface TokenomicsConfig {
  /** Total max supply cap (18 dec bigint). Set to 0 for uncapped. */
  maxSupply: bigint;
  /** Initial circulating supply (18 dec bigint) */
  initialSupply: bigint;
  /** Block or timestamp at which emissions start */
  startBlock: number;
  /** Emission schedule shape */
  emissionSchedule: EmissionSchedule;
  /** Initial emission rate per block/second, 18 dec bigint */
  initialEmissionRate: bigint;
  /**
   * For "halving": blocks/seconds between halvings.
   * For "decay": continuous decay rate (e.g. 0.0001 per second).
   * For "linear" / "fixed": ignored.
   */
  halvingInterval?: number;
  decayRate?: number;
  /** Burn model */
  burnModel: BurnModel;
  /** For flat fee / tx fee burn: basis points of each tx that are burned */
  burnBps?: number;
  /** Bonding curve params for price model (optional) */
  bondingCurve?: BondingCurveParams;
  /** Number of future blocks/seconds to project */
  projectionBlocks?: number;
}

export interface TokenomicsDesign {
  schedule: EmissionSchedulePoint[];
  supplyProjection: TokenomicsSnapshot[];
  bondingCurveSample?: CurvePoint[];
  summary: TokenomicsSummary;
}

export interface EmissionSchedulePoint {
  block: number;
  emissionRate: number;
  cumulativeEmitted: number;
}

export interface TokenomicsSummary {
  initialSupply:    string;
  maxSupply:        string;
  projectedSupply90d:  string;
  projectedSupply365d: string;
  inflationRate90d:    string;
  inflationRate365d:   string;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function designTokenomics(config: TokenomicsConfig): TokenomicsDesign {
  const projBlocks = config.projectionBlocks ?? 2_628_000; // ~1 year at 12s/block

  // ── Emission schedule ─────────────────────────────────────────────────────
  const schedulePoints = 50;
  const step = Math.floor(projBlocks / schedulePoints);
  const schedule: EmissionSchedulePoint[] = [];
  let cumulative = 0;

  for (let i = 0; i <= schedulePoints; i++) {
    const block = config.startBlock + i * step;
    let rate: number;

    switch (config.emissionSchedule) {
      case "halving":
        rate = emissionHalving(
          block,
          config.startBlock,
          Number(config.initialEmissionRate) / 1e18,
          config.halvingInterval ?? 210_000,
        );
        break;
      case "decay":
        rate = emissionDecay(
          i * step,
          Number(config.initialEmissionRate) / 1e18,
          config.decayRate ?? 0.0000001,
        );
        break;
      case "linear": {
        const progress = Math.min(i / schedulePoints, 1);
        rate = (Number(config.initialEmissionRate) / 1e18) * (1 - progress);
        break;
      }
      default:
        rate = Number(config.initialEmissionRate) / 1e18;
    }

    cumulative += rate * step;
    schedule.push({ block, emissionRate: rate, cumulativeEmitted: cumulative });
  }

  // ── Supply projection (365 days @ ~7200 blocks/day, daily samples) ───────
  const blocksPerDay    = 7_200;
  const projectionDays  = 365;
  const supplyProjection = simulateSupply(
    Number(config.initialSupply) / 1e18,    // initialSupply
    projectionDays * blocksPerDay,           // blocks
    Number(config.initialEmissionRate) / 1e18, // emissionRate per block
    config.burnBps ? config.burnBps / 10_000 : 0, // burnRatePct
    config.halvingInterval ?? 0,             // halvingInterval
    blocksPerDay,                            // sampleInterval (1 snapshot per day)
  );

  // ── Bonding curve sample ──────────────────────────────────────────────────
  let bondingCurveSample: CurvePoint[] | undefined;
  if (config.bondingCurve) {
    const maxSupply = config.maxSupply > 0n
      ? Number(config.maxSupply) / 1e18
      : Number(config.initialSupply) / 1e18 * 10;
    bondingCurveSample = sampleCurve(config.bondingCurve, maxSupply, 100);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const snap90  = supplyProjection[89]  ?? supplyProjection[supplyProjection.length - 1];
  const snap365 = supplyProjection[364] ?? supplyProjection[supplyProjection.length - 1];
  const initSupplyNum = Number(config.initialSupply) / 1e18;

  const inflation90  = snap90  ? ((snap90.circulatingSupply  - initSupplyNum) / initSupplyNum * 100) : 0;
  const inflation365 = snap365 ? ((snap365.circulatingSupply - initSupplyNum) / initSupplyNum * 100) : 0;

  const summary: TokenomicsSummary = {
    initialSupply:       config.initialSupply.toString(),
    maxSupply:           config.maxSupply.toString(),
    projectedSupply90d:  snap90  ? (snap90.circulatingSupply  * 1e18).toFixed(0) : "0",
    projectedSupply365d: snap365 ? (snap365.circulatingSupply * 1e18).toFixed(0) : "0",
    inflationRate90d:    `${inflation90.toFixed(2)}%`,
    inflationRate365d:   `${inflation365.toFixed(2)}%`,
  };

  return { schedule, supplyProjection, bondingCurveSample, summary };
}

// ── Convenience re-exports ────────────────────────────────────────────────────

export { emissionHalving, emissionDecay, totalEmission, aprFromRate, apyFromApr };
export type { CurvePoint, TokenomicsSnapshot };
