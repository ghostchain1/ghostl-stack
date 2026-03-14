/**
 * Validator Reputation Engine
 * Maintains live ValidatorRecord map, scores validators, applies thresholds.
 */
import {
  type ValidatorRecord,
  type FederationRegion,
  type ReputationUpdateInput,
  REPUTATION_THRESHOLDS,
  computeReputationScore,
} from "ghost-federation-sdk";

export type ValidatorAction = "none" | "warn" | "quarantine" | "slash" | "force_exit" | "reinstate";

export interface ValidatorThresholdResult {
  action: ValidatorAction;
  reason: string;
  humanApprovalRequired: boolean;
}

class ReputationEngine {
  private registry = new Map<string, ValidatorRecord>(); // address → record

  onboard(
    address: string,
    region: FederationRegion,
    meta?: { host?: string }
  ): ValidatorRecord {
    const existing = this.registry.get(address.toLowerCase());
    if (existing) return existing;

    const record: ValidatorRecord = {
      address: address.toLowerCase(),
      region,
      status: "active",
      reputationScore: 750, // start at good standing
      uptime: 1,
      avgLatencyMs: 100,
      participationRate: 1,
      slashCount: 0,
      totalBlocks: 0,
      missedBlocks: 0,
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    this.registry.set(record.address, record);
    return record;
  }

  update(input: ReputationUpdateInput): { record: ValidatorRecord; result: ValidatorThresholdResult } {
    const addr = input.address.toLowerCase();
    let record = this.registry.get(addr);
    if (!record) {
      throw new Error(`Validator not found: ${addr}`);
    }

    // Derive scalar metrics from sample arrays
    const uptime = input.uptimeSamples.length > 0
      ? input.uptimeSamples.filter(Boolean).length / input.uptimeSamples.length
      : record.uptime;
    const avgLatencyMs = input.latencySamplesMs.length > 0
      ? input.latencySamplesMs.reduce((a, b) => a + b, 0) / input.latencySamplesMs.length
      : record.avgLatencyMs;
    const totalBlocks = input.blocksProposed + input.blocksMissed;
    const participationRate = totalBlocks > 0
      ? input.blocksProposed / totalBlocks
      : record.participationRate;

    record.uptime = uptime;
    record.avgLatencyMs = avgLatencyMs;
    record.participationRate = participationRate;
    record.slashCount = input.slashEventCount;
    record.totalBlocks = totalBlocks;
    record.missedBlocks = input.blocksMissed;
    record.reputationScore = computeReputationScore(input);
    record.lastActiveAt = Date.now();

    const result = this.applyThresholds(record);

    // Status transitions
    if (result.action === "quarantine") record.status = "quarantined";
    else if (result.action === "force_exit") record.status = "exiting";
    else if (result.action === "reinstate") record.status = "active";

    this.registry.set(addr, record);
    return { record, result };
  }

  applyThresholds(record: ValidatorRecord): ValidatorThresholdResult {
    const { reputationScore: score } = record;
    if (score <= REPUTATION_THRESHOLDS.FORCE_EXIT) {
      return { action: "force_exit", reason: `Score ${score} ≤ FORCE_EXIT threshold`, humanApprovalRequired: true };
    }
    if (score <= REPUTATION_THRESHOLDS.SLASH) {
      return { action: "slash", reason: `Score ${score} ≤ SLASH threshold`, humanApprovalRequired: true };
    }
    if (score <= REPUTATION_THRESHOLDS.QUARANTINE) {
      return { action: "quarantine", reason: `Score ${score} ≤ QUARANTINE threshold`, humanApprovalRequired: false };
    }
    if (record.status === "quarantined" && score >= REPUTATION_THRESHOLDS.REINSTATE) {
      return { action: "reinstate", reason: `Score ${score} ≥ REINSTATE threshold`, humanApprovalRequired: false };
    }
    if (score < 500) {
      return { action: "warn", reason: `Score ${score} below 500 — monitoring escalated`, humanApprovalRequired: false };
    }
    return { action: "none", reason: "Score nominal", humanApprovalRequired: false };
  }

  getAll(): ValidatorRecord[] {
    return [...this.registry.values()];
  }

  getByRegion(region: FederationRegion): ValidatorRecord[] {
    return [...this.registry.values()].filter((v) => v.region === region);
  }

  getByAddress(address: string): ValidatorRecord | undefined {
    return this.registry.get(address.toLowerCase());
  }

  getLeaderboard(region?: FederationRegion): ValidatorRecord[] {
    const list = region ? this.getByRegion(region) : this.getAll();
    return list.sort((a, b) => b.reputationScore - a.reputationScore);
  }

  getAtRisk(): ValidatorRecord[] {
    return this.getAll().filter((v) => v.reputationScore < REPUTATION_THRESHOLDS.QUARANTINE);
  }
}

export const reputationEngine = new ReputationEngine();
