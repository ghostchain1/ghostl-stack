/**
 * Risk Manager
 *
 * Detects network anomalies (tx spikes, liquidity drain, block time violations)
 * and generates emergency_pause proposals for human ratification or, if
 * ALLOW_EMERGENCY_EXEC=true, for automatic execution.
 *
 * The risk manager runs first in each governor cycle. If a critical risk is
 * detected, governor-core skips non-critical modules to reduce noise.
 */
import { randomUUID } from "node:crypto";
import type { NetworkState, GovernorProposal } from "../types.js";
import { SECURITY_POLICY } from "../policies/security-policy.js";
import { ALLOW_EMERGENCY_EXEC } from "../state.js";

export interface RiskResult {
  proposals: GovernorProposal[];
  /** True when a critical condition was detected — signals governor-core to halt other modules. */
  critical: boolean;
}

export async function detectRisk(network: NetworkState): Promise<RiskResult> {
  const proposals: GovernorProposal[] = [];
  let critical = false;

  const now = Date.now();

  // --- Tx spike detection ---
  if (network.defi.txSpike > SECURITY_POLICY.TX_SPIKE_THRESHOLD) {
    critical = true;
    proposals.push({
      id:          randomUUID(),
      type:        "emergency_pause",
      description: `Tx rate spike detected: ${network.defi.txSpike.toFixed(2)}× above baseline (threshold: ${SECURITY_POLICY.TX_SPIKE_THRESHOLD}×). Possible DoS or flash-loan attack.`,
      params: {
        txSpike:   network.defi.txSpike,
        threshold: SECURITY_POLICY.TX_SPIKE_THRESHOLD,
        layer:     "L2",
      },
      timestamp:            now,
      risk:                 "critical",
      requiresRatification: !ALLOW_EMERGENCY_EXEC,
      autoExecute:           ALLOW_EMERGENCY_EXEC,
    });
  }

  // --- Anomalous liquidity drain ---
  if (network.defi.anomalousDrain) {
    critical = true;
    proposals.push({
      id:          randomUUID(),
      type:        "emergency_pause",
      description: `Anomalous liquidity drain detected on L2. GST reserve below ${SECURITY_POLICY.LIQUIDITY_DRAIN_DROP_PCT / 2}% of policy minimum. Possible rug or exploit.`,
      params: {
        l2GstReservePct: network.liquidity.l2GstReservePct,
        layer:           "L2",
      },
      timestamp:            now,
      risk:                 "critical",
      requiresRatification: !ALLOW_EMERGENCY_EXEC,
      autoExecute:           ALLOW_EMERGENCY_EXEC,
    });
  }

  // --- Block time violations on L1 ---
  if (
    network.l1.reachable &&
    network.l1.blockTime > 0 &&
    (network.l1.blockTime < SECURITY_POLICY.MIN_BLOCK_TIME ||
     network.l1.blockTime > SECURITY_POLICY.MAX_BLOCK_TIME)
  ) {
    proposals.push({
      id:          randomUUID(),
      type:        "emergency_pause",
      description: `L1 block time anomaly: ${network.l1.blockTime}s (expected ${SECURITY_POLICY.MIN_BLOCK_TIME}–${SECURITY_POLICY.MAX_BLOCK_TIME}s). Possible fork or node outage.`,
      params: {
        blockTime: network.l1.blockTime,
        chainId:   network.l1.chainId,
      },
      timestamp:            now,
      risk:                 "high",
      requiresRatification: true,
      autoExecute:          false,
    });
  }

  // --- L1/L2/L3 reachability loss ---
  const unreachable = [network.l1, network.l2, network.l3].filter(c => !c.reachable);
  if (unreachable.length > 0) {
    proposals.push({
      id:          randomUUID(),
      type:        "emergency_pause",
      description: `${unreachable.length} chain(s) unreachable: ${unreachable.map(c => `chainId ${c.chainId}`).join(", ")}. Node health check required.`,
      params: {
        unreachableChains: unreachable.map(c => ({ chainId: c.chainId, rpc: c.rpc })),
      },
      timestamp:            now,
      risk:                 unreachable.length >= 2 ? "critical" : "high",
      requiresRatification: true,
      autoExecute:          false,
    });
    if (unreachable.length >= 2) critical = true;
  }

  return { proposals, critical };
}
