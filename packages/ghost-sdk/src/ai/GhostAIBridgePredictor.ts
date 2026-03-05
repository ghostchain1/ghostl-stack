/**
 * GhostAIBridgePredictor
 *
 * Predicts bridge congestion and optimal deposit/withdrawal timing
 * across the L3 → L2 → L1 GhostStack derivation hierarchy.
 */

import type { GhostLayer } from "../networks.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BridgeDirection = "L3_TO_L2" | "L2_TO_L1" | "L3_TO_L1";

export interface BridgeLoad {
  direction:       BridgeDirection;
  /** 0–100 queue fill percentage */
  queueLoad:       number;
  /** Average relay time in seconds over last 100 msgs */
  avgRelaySeconds: number;
  /** Number of pending messages in the bridge queue */
  pendingMessages: number;
}

export type BridgePrediction = "fast" | "delay" | "congested";

export interface BridgeForecast {
  direction:          BridgeDirection;
  prediction:         BridgePrediction;
  /** Expected relay time in seconds */
  expectedSeconds:    number;
  /** Whether to hold the tx and retry later */
  suggestDelay:       boolean;
  /** Reason for the prediction */
  reason:             string;
  /** Confidence 0–1 */
  confidence:         number;
}

export interface BridgePredictorConfig {
  /** Load % above which "delay" is signalled. Default: 70 */
  delayThreshold?:    number;
  /** Load % above which "congested" is signalled. Default: 85 */
  congestedThreshold?: number;
  /** Rolling history window size. Default: 20 samples */
  historyWindow?:     number;
}

// ── GhostAIBridgePredictor ────────────────────────────────────────────────────

export class GhostAIBridgePredictor {
  private readonly delayThreshold:     number;
  private readonly congestedThreshold: number;
  private readonly historyWindow:      number;
  private readonly history:            Map<BridgeDirection, number[]> = new Map();

  constructor(config: BridgePredictorConfig = {}) {
    this.delayThreshold     = config.delayThreshold     ?? 70;
    this.congestedThreshold = config.congestedThreshold ?? 85;
    this.historyWindow      = config.historyWindow      ?? 20;
  }

  /**
   * Predict bridge performance for a given load snapshot.
   */
  predict(load: BridgeLoad): BridgeForecast {
    this._record(load.direction, load.queueLoad);

    const avgLoad = this._average(load.direction);
    const prediction = this._classify(load.queueLoad, avgLoad);
    const expectedSeconds = this._estimateTime(load, prediction);
    const suggestDelay = prediction === "congested" ||
                         (prediction === "delay" && load.pendingMessages > 200);
    const confidence = this._confidence(load.direction);

    return {
      direction: load.direction,
      prediction,
      expectedSeconds,
      suggestDelay,
      reason: this._reason(load, prediction, avgLoad),
      confidence,
    };
  }

  /**
   * Predict all three bridge directions from a set of load snapshots.
   */
  predictAll(loads: BridgeLoad[]): BridgeForecast[] {
    return loads.map(l => this.predict(l));
  }

  /**
   * Best-direction suggestion: find the least congested path from origin to L1.
   */
  bestPath(
    origin: Extract<GhostLayer, "L2" | "L3">,
    loads: BridgeLoad[]
  ): BridgeDirection[] {
    if (origin === "L2") return ["L2_TO_L1"];

    // L3 → L1 can go directly or via L2
    const directLoad  = loads.find(l => l.direction === "L3_TO_L1");
    const l3ToL2Load  = loads.find(l => l.direction === "L3_TO_L2");
    const l2ToL1Load  = loads.find(l => l.direction === "L2_TO_L1");

    if (!directLoad && l3ToL2Load && l2ToL1Load) {
      return ["L3_TO_L2", "L2_TO_L1"];
    }
    if (directLoad && l3ToL2Load && l2ToL1Load) {
      const directCost = directLoad.avgRelaySeconds;
      const viaCost    = l3ToL2Load.avgRelaySeconds + l2ToL1Load.avgRelaySeconds;
      return directCost <= viaCost ? ["L3_TO_L1"] : ["L3_TO_L2", "L2_TO_L1"];
    }
    return ["L3_TO_L2", "L2_TO_L1"]; // safe default
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _record(dir: BridgeDirection, load: number): void {
    const arr = this.history.get(dir) ?? [];
    arr.push(load);
    if (arr.length > this.historyWindow) arr.shift();
    this.history.set(dir, arr);
  }

  private _average(dir: BridgeDirection): number {
    const arr = this.history.get(dir) ?? [];
    if (!arr.length) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  private _classify(current: number, avg: number): BridgePrediction {
    const effective = (current * 0.7) + (avg * 0.3);
    if (effective >= this.congestedThreshold) return "congested";
    if (effective >= this.delayThreshold)     return "delay";
    return "fast";
  }

  private _estimateTime(load: BridgeLoad, pred: BridgePrediction): number {
    const base = load.avgRelaySeconds;
    if (pred === "fast")      return base;
    if (pred === "delay")     return Math.round(base * 1.8);
    return Math.round(base * 3.5);
  }

  private _reason(load: BridgeLoad, pred: BridgePrediction, avg: number): string {
    if (pred === "fast")      return `bridge queue at ${load.queueLoad}% (avg ${Math.round(avg)}%) — clear`;
    if (pred === "delay")     return `bridge queue at ${load.queueLoad}% — elevated delay expected`;
    return `bridge queue at ${load.queueLoad}% — congested, consider waiting`;
  }

  private _confidence(dir: BridgeDirection): number {
    const samples = this.history.get(dir)?.length ?? 0;
    return Math.min(0.5 + (samples / this.historyWindow) * 0.45, 0.95);
  }
}
