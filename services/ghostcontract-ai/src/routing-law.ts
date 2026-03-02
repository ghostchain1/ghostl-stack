/**
 * GhostContractAI — Routing Law Enforcement
 *
 * NON-NEGOTIABLE HARD INVARIANT:
 *   L3 transacts ONLY with L2.
 *   L2 transacts ONLY with L1 (GhostChain).
 *   No direct L3→L1 bypass. No L2→external. No L3→external.
 *
 * Any operation specifying an illegal chain routing is rejected with
 * a RoutingLawViolationError before any action is taken.
 */

import { CHAIN_IDS } from "./config.js";
import { routingLawViolations } from "./metrics.js";

export class RoutingLawViolationError extends Error {
  constructor(
    public readonly fromChain: number,
    public readonly toChain: number,
    public readonly reason: string,
  ) {
    super(`ROUTING_LAW_VIOLATION: ${reason} (from=${fromChain} to=${toChain})`);
    this.name = "RoutingLawViolationError";
  }
}

// ─── Layer resolution ────────────────────────────────────────────────────────

export type Layer = "L1" | "L2" | "L3";

export function getLayer(chainId: number): Layer {
  if (chainId === CHAIN_IDS.L1) return "L1";
  if (chainId === CHAIN_IDS.L2) return "L2";
  if (chainId === CHAIN_IDS.L3) return "L3";
  throw new Error(`UNKNOWN_CHAIN_ID: ${chainId}. Register it in GHOSTAI_L*_CHAIN_ID env vars.`);
}

export function getChainId(layer: Layer): number {
  return CHAIN_IDS[layer];
}

// ─── Legal adjacency table ───────────────────────────────────────────────────
//
//   FROM → TO  | L1   | L2   | L3
//   -----------+------+------+------
//   L3         |  ✗   |  ✓   |  ✗    (L3 → L2 ONLY)
//   L2         |  ✓   |  ✗   |  ✗    (L2 → L1 ONLY)
//   L1         |  ✗   |  ✗   |  ✗    (L1 is root — no outbound in registry)
//
const LEGAL_LINKS: Record<Layer, Layer | null> = {
  L3: "L2",  // L3 may only route to its parent L2
  L2: "L1",  // L2 may only route to its parent L1
  L1: null,  // L1 is root; no outbound cross-chain links via this registry
};

// ─── Enforcement ─────────────────────────────────────────────────────────────

/**
 * Assert that a cross-chain operation from `fromChain` → `toChain` is legal.
 * Throws RoutingLawViolationError on violation.
 */
export function assertRoutingLaw(fromChainId: number, toChainId: number): void {
  const fromLayer = getLayer(fromChainId);
  const toLayer   = getLayer(toChainId);
  const allowed   = LEGAL_LINKS[fromLayer];

  if (allowed === null) {
    routingLawViolations.inc({ from_chain: String(fromChainId), to_chain: String(toChainId) });
    throw new RoutingLawViolationError(fromChainId, toChainId,
      `L1_IS_ROOT_NO_OUTBOUND_LINKS`);
  }

  if (toLayer !== allowed) {
    routingLawViolations.inc({ from_chain: String(fromChainId), to_chain: String(toChainId) });
    throw new RoutingLawViolationError(fromChainId, toChainId,
      `${fromLayer}_MUST_LINK_TO_${allowed}_ONLY — got ${toLayer}`);
  }
}

/**
 * Assert that a deploy/upgrade action targets a valid chain layer.
 * Cross-chain proposals follow the routing law:
 *   - L3 deploys are orchestrated via L2 (this service calls L2 RPC).
 *   - L2 deploys are settled via L1 RPC.
 *   - L1 deploys are direct (root authority).
 */
export function assertDeployTarget(targetChainId: number): Layer {
  return getLayer(targetChainId); // throws for unknown chain
}

/**
 * For a deploy originating at `originLayer` targeting `targetLayer`,
 * validate the orchestration path: L3 deploys must go through L2, etc.
 */
export function assertOrchestrationPath(
  originLayer: Layer,
  targetLayer: Layer,
): void {
  // Direct same-layer deploys are OK.
  if (originLayer === targetLayer) return;

  // L3 operator proposing L2 deploy: legal (L3 requests → L2 validates).
  if (originLayer === "L3" && targetLayer === "L2") return;

  // L2 operator proposing L1 settle: legal.
  if (originLayer === "L2" && targetLayer === "L1") return;

  // Anything else (e.g. L3 operator trying to directly target L1) is illegal.
  throw new RoutingLawViolationError(
    CHAIN_IDS[originLayer],
    CHAIN_IDS[targetLayer],
    `ILLEGAL_ORCHESTRATION_PATH: ${originLayer} → ${targetLayer}`,
  );
}

/**
 * Type-safe chain layer string validator.
 */
export function parseLayer(raw: string): Layer {
  if (raw === "L1" || raw === "L2" || raw === "L3") return raw;
  throw new Error(`INVALID_LAYER: "${raw}". Must be L1, L2, or L3.`);
}
