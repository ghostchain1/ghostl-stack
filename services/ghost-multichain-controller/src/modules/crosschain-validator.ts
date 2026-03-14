/**
 * Cross-Chain Validator
 *
 * Validates bridge proofs and monitors bridge sync health.
 *
 * Proof validation:
 *   A bridge proof commitment is sha256(txHash + amount + sender + recipient).
 *   This is a simplified validity check; production systems use full Merkle proofs
 *   against committed L1 state roots.
 *
 * Sync health monitoring:
 *   If any active bridge is unreachable or has a risk score above the critical
 *   threshold, a validator_alert action is generated.
 */
import { createHash }          from "node:crypto";
import { randomUUID }          from "node:crypto";
import type { BridgeProof, MultichainState, MultichainAction } from "../types.js";
import { isValidRoute }        from "../policies/sovereignty-policy.js";
import { BRIDGE_POLICY }       from "../policies/bridge-policy.js";

/**
 * Validate a bridge proof commitment.
 * Returns true if sha256(txHash + amount + sender + recipient) matches proof.commitment.
 */
export function validateBridgeProof(proof: BridgeProof): boolean {
  // Validate sovereignty: the route must be permitted
  if (!isValidRoute({ originLayer: proof.sourceChain, destination: proof.destChain })) {
    console.error(
      `[crosschain-validator] sovereignty violation in proof: ` +
      `${proof.sourceChain} → ${proof.destChain}`,
    );
    return false;
  }

  const expected = createHash("sha256")
    .update(proof.txHash + proof.amount + proof.sender + proof.recipient)
    .digest("hex");

  return expected === proof.commitment;
}

/**
 * Monitor active bridges and generate validator_alert actions for any bridge
 * that is unreachable or has a risk score above the critical threshold.
 */
export function runCrosschainValidator(state: MultichainState): MultichainAction[] {
  const actions: MultichainAction[] = [];
  const now      = Date.now();

  for (const bridge of state.bridges) {
    if (!bridge.reachable) {
      actions.push({
        id:          randomUUID(),
        type:        "validator_alert",
        sourceChain: bridge.sourceChain,
        destChain:   bridge.destChain,
        description: `Bridge "${bridge.name}" is UNREACHABLE. Manual inspection required before re-enabling.`,
        params: { bridgeId: bridge.id, health: bridge.health, riskScore: bridge.riskScore },
        timestamp:   now,
        risk:        "critical",
        requiresRatification: true,
        sovereigntyValidated: true,
      });
      continue;
    }

    if (bridge.riskScore >= BRIDGE_POLICY.CRITICAL_RISK_SCORE) {
      actions.push({
        id:          randomUUID(),
        type:        "validator_alert",
        sourceChain: bridge.sourceChain,
        destChain:   bridge.destChain,
        description: `Bridge "${bridge.name}" risk score is critical (${bridge.riskScore}/100). ` +
                     `Review bridge health (${bridge.health}%), pending TXs (${bridge.pendingTxCount}), ` +
                     `latency (${bridge.latencyMs}ms).`,
        params: { bridgeId: bridge.id, health: bridge.health, riskScore: bridge.riskScore,
                  pendingTxCount: bridge.pendingTxCount, latencyMs: bridge.latencyMs },
        timestamp:   now,
        risk:        "high",
        requiresRatification: true,
        sovereigntyValidated: true,
      });
    }
  }

  return actions;
}
