/**
 * Bridge Risk Analyzer
 *
 * Computes a composite risk score (0–100) for each bridge from:
 *   - Health deficit   (up to 40 pts): distance below MIN_HEALTH_SCORE
 *   - Pending TX load  (up to 30 pts): congestion relative to MAX_PENDING_TXS
 *   - Latency          (up to 20 pts): ms over MAX_LATENCY_MS
 *   - Unreachable      (flat 10 pts): adapter returned healthy=false
 *
 * A higher score means higher risk.
 */
import type { BridgeInfo, ChainSnapshot } from "../types.js";
import { BRIDGE_POLICY }                  from "../policies/bridge-policy.js";

/** Score a single bridge given its current snapshot. */
export function scoreBridgeRisk(
  bridge: Pick<BridgeInfo, "health" | "pendingTxCount" | "latencyMs" | "reachable">,
): number {
  let score = 0;

  // Health deficit: 40 points if health = 0, 0 if health ≥ MIN_HEALTH_SCORE
  const healthGap = Math.max(0, BRIDGE_POLICY.MIN_HEALTH_SCORE - bridge.health);
  score += Math.min(40, (healthGap / BRIDGE_POLICY.MIN_HEALTH_SCORE) * 40);

  // Pending TX congestion: 30 points at MAX_PENDING_TXS
  score += Math.min(30, (bridge.pendingTxCount / BRIDGE_POLICY.MAX_PENDING_TXS) * 30);

  // Latency: 20 points at MAX_LATENCY_MS
  score += Math.min(20, (bridge.latencyMs / BRIDGE_POLICY.MAX_LATENCY_MS) * 20);

  // Unreachable flat penalty
  if (!bridge.reachable) score += 10;

  return Math.min(100, Math.round(score));
}

/**
 * Build a BridgeInfo from a chain snapshot (used when no on-chain contract
 * data is available yet — adapters provide the baseline health signal).
 */
export function bridgeInfoFromSnapshot(
  id: string,
  name: string,
  snapshot: ChainSnapshot,
  pendingTxCount: number = 0,
): BridgeInfo {
  const latencyMs  = snapshot.latencyMs;
  const reachable  = snapshot.healthy;

  // When reachable, start at 100 and deduct for latency and congestion
  const baseHealth = reachable
    ? Math.max(0, 100 - Math.floor(latencyMs / 100) - pendingTxCount)
    : 0;

  const health    = Math.min(100, baseHealth);
  const riskScore = scoreBridgeRisk({ health, pendingTxCount, latencyMs, reachable });

  return {
    id,
    name,
    sourceChain:    "L1",
    destChain:      snapshot.chainId,
    health,
    tvlGst:         "0",   // populated by contract reads when bridge address is configured
    latencyMs,
    pendingTxCount,
    lastSyncBlock:  snapshot.blockHeight,
    reachable,
    riskScore,
  };
}
