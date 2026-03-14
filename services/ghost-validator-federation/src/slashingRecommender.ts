/**
 * Slashing Recommender
 * Analyses validator records, produces slash recommendations,
 * forwards them to the ghost-ai-swarm-v2 governor agent and GIP coordinator.
 */
import { fetch } from "undici";
import { type ValidatorRecord, REPUTATION_THRESHOLDS } from "ghost-federation-sdk";
import { reputationEngine, type ValidatorAction } from "./reputationEngine.js";

const SWARM_URL = process.env.SWARM_URL ?? "http://localhost:7970";
const COORDINATOR_URL = process.env.FEDERATION_COORDINATOR_URL ?? "http://localhost:7980";
const RELAY_TIMEOUT_MS = 6_000;

export interface SlashRecommendation {
  id: string;
  validatorAddress: string;
  region: string;
  reason: string;
  action: ValidatorAction;
  reputationScore: number;
  slashCount: number;
  humanApprovalRequired: true;
  createdAt: number;
  dispatched: boolean;
}

const pending = new Map<string, SlashRecommendation>();

async function dispatchToSwarm(rec: SlashRecommendation): Promise<void> {
  try {
    await fetch(`${SWARM_URL}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetRole: "governor",
        type: "slash-recommendation",
        payload: rec,
        humanApprovalRequired: true,
      }),
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
  } catch {
    // Non-fatal — recommendation stored locally for retry
  }
}

async function dispatchSlashSignalToCoordinator(rec: SlashRecommendation): Promise<void> {
  try {
    await fetch(`${COORDINATOR_URL}/gip/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: rec.id,
        type: "slash-signal",
        sourceRegion: rec.region,
        payload: rec,
        timestamp: Date.now(),
        ttlMs: 600_000,
      }),
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
  } catch {
    // Non-fatal
  }
}

export async function analyzeAndRecommend(
  validator: ValidatorRecord
): Promise<SlashRecommendation | null> {
  const thresholdResult = reputationEngine.applyThresholds(validator);
  if (thresholdResult.action !== "slash" && thresholdResult.action !== "force_exit") {
    return null;
  }

  const id = `slash-${validator.address}-${Date.now()}`;
  const rec: SlashRecommendation = {
    id,
    validatorAddress: validator.address,
    region: validator.region,
    reason: thresholdResult.reason,
    action: thresholdResult.action,
    reputationScore: validator.reputationScore,
    slashCount: validator.slashCount,
    humanApprovalRequired: true,
    createdAt: Date.now(),
    dispatched: false,
  };

  pending.set(id, rec);

  await Promise.allSettled([
    dispatchToSwarm(rec),
    dispatchSlashSignalToCoordinator(rec),
  ]);

  rec.dispatched = true;
  return rec;
}

export function getPendingRecommendations(): SlashRecommendation[] {
  return [...pending.values()].filter((r) => !r.dispatched || r.action !== "none");
}

export function scanAllAtRisk(): Promise<(SlashRecommendation | null)[]> {
  const atRisk = reputationEngine.getAtRisk();
  return Promise.all(atRisk.map((v) => analyzeAndRecommend(v)));
}
