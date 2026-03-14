/**
 * Bridge Manager
 *
 * Monitors active bridge health and generates proposals for:
 *   - bridge_restart: health below MIN_HEALTH_SCORE (medium/high risk)
 *   - bridge_pause:   risk score at or above CRITICAL_RISK_SCORE (critical risk)
 *
 * All bridge actions ALWAYS require human ratification.
 * The actual restart/pause is executed by ghost-infra-controller (port 7940)
 * after ratification — this controller only generates the proposals.
 *
 * Sovereignty: all bridge routes are L1 ↔ external chains (valid routes).
 */
import { randomUUID }     from "node:crypto";
import type { MultichainState, MultichainAction } from "../types.js";
import { BRIDGE_POLICY }  from "../policies/bridge-policy.js";

export async function manageBridges(state: MultichainState): Promise<MultichainAction[]> {
  const actions: MultichainAction[] = [];
  const now = Date.now();

  for (const bridge of state.bridges) {
    if (bridge.riskScore >= BRIDGE_POLICY.CRITICAL_RISK_SCORE) {
      // Critical: propose immediate pause
      actions.push({
        id:          randomUUID(),
        type:        "bridge_pause",
        sourceChain: bridge.sourceChain,
        destChain:   bridge.destChain,
        description: `CRITICAL: Bridge "${bridge.name}" (risk=${bridge.riskScore}/100, ` +
                     `health=${bridge.health}%) exceeds critical risk threshold. ` +
                     `Propose pausing bridge until root cause is resolved.`,
        params: {
          bridgeId:     bridge.id,
          health:       bridge.health,
          riskScore:    bridge.riskScore,
          pendingTxs:   bridge.pendingTxCount,
          latencyMs:    bridge.latencyMs,
          lastSyncBlock: bridge.lastSyncBlock,
        },
        timestamp:            now,
        risk:                 "critical",
        requiresRatification: true,
        sovereigntyValidated: true,
      });
      continue;
    }

    if (bridge.health < BRIDGE_POLICY.MIN_HEALTH_SCORE) {
      const risk = bridge.health < BRIDGE_POLICY.MIN_HEALTH_SCORE / 2 ? "high" : "medium";
      actions.push({
        id:          randomUUID(),
        type:        "bridge_restart",
        sourceChain: bridge.sourceChain,
        destChain:   bridge.destChain,
        description: `Bridge "${bridge.name}" health degraded (${bridge.health}% < ` +
                     `${BRIDGE_POLICY.MIN_HEALTH_SCORE}% threshold, latency=${bridge.latencyMs}ms). ` +
                     `Propose bridge restart after investigation.`,
        params: {
          bridgeId:     bridge.id,
          health:       bridge.health,
          riskScore:    bridge.riskScore,
          pendingTxs:   bridge.pendingTxCount,
          latencyMs:    bridge.latencyMs,
          lastSyncBlock: bridge.lastSyncBlock,
        },
        timestamp:            now,
        risk,
        requiresRatification: true,
        sovereigntyValidated: true,
      });
    }
  }

  return actions;
}
