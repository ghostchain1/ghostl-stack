/**
 * GhostBrain Core — Routing Law Enforcement
 *
 * NON-NEGOTIABLE HARD INVARIANT (mirrors ghostcontract-ai):
 *   L3 → L2 ONLY
 *   L2 → L1 (GhostChain root) ONLY
 *   L3 → L1 direct: FORBIDDEN
 *   L1 has no outbound cross-chain links in this registry
 *
 * GhostBrain enforces this before issuing any task token
 * or approving any change plan that crosses chain boundaries.
 */

import type { Layer } from "../types.js";
import { CHAIN_IDS } from "../config.js";
import { routingLawViolations } from "../metrics.js";

export class RoutingLawViolationError extends Error {
  constructor(
    public readonly fromLayer: Layer,
    public readonly toLayer: Layer,
    public readonly reason: string,
  ) {
    super(`ROUTING_LAW_VIOLATION: ${reason} (from=${fromLayer} to=${toLayer})`);
    this.name = "RoutingLawViolationError";
  }
}

// ─── Layer resolution ─────────────────────────────────────────────────────────
export function getLayer(chainId: number): Layer {
  if (chainId === CHAIN_IDS.L1) return "L1";
  if (chainId === CHAIN_IDS.L2) return "L2";
  if (chainId === CHAIN_IDS.L3) return "L3";
  throw new Error(`UNKNOWN_CHAIN_ID: ${chainId}. Must be one of L1=${CHAIN_IDS.L1} L2=${CHAIN_IDS.L2} L3=${CHAIN_IDS.L3}`);
}

// ─── Legal adjacency (directed) ───────────────────────────────────────────────
//
//   FROM → legal TO
//   L3   → L2 only
//   L2   → L1 only
//   L1   → (none — root)
//
const LEGAL_LINKS: Record<Layer, Layer | null> = {
  L3: "L2",
  L2: "L1",
  L1: null,
};

/**
 * Assert that a cross-chain hop from `fromLayer` to `toLayer` is legal.
 * Throws RoutingLawViolationError on any violation.
 */
export function assertRoutingLaw(fromLayer: Layer, toLayer: Layer): void {
  const allowed = LEGAL_LINKS[fromLayer];

  if (allowed === null) {
    routingLawViolations.inc({ from_layer: fromLayer, to_layer: toLayer });
    throw new RoutingLawViolationError(fromLayer, toLayer,
      `L1_IS_ROOT_NO_OUTBOUND_CROSS_CHAIN_LINKS`);
  }

  if (toLayer !== allowed) {
    routingLawViolations.inc({ from_layer: fromLayer, to_layer: toLayer });
    throw new RoutingLawViolationError(fromLayer, toLayer,
      `${fromLayer}_MUST_ROUTE_TO_${allowed}_ONLY — attempted ${toLayer}`);
  }
}

/**
 * Convenience: assert routing law by numeric chain IDs.
 */
export function assertRoutingLawByChainId(fromChainId: number, toChainId: number): void {
  assertRoutingLaw(getLayer(fromChainId), getLayer(toChainId));
}

/**
 * Boolean check (no throw) — use in plan simulation.
 */
export function isRoutingLegal(fromLayer: Layer, toLayer: Layer): boolean {
  try {
    assertRoutingLaw(fromLayer, toLayer);
    return true;
  } catch {
    return false;
  }
}
