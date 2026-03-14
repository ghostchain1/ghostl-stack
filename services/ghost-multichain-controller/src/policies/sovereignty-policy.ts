/**
 * Sovereignty Policy
 *
 * Enforces the GhostChain architectural law:
 *
 *   L3 → L2 → GhostChain L1 → External Chains
 *
 * L3 and L2 NEVER communicate with external chains directly.
 * All external chain interactions are initiated by and routed through L1.
 *
 * Valid route pairs  (origin : destination):
 *   Internal hops  → L3:L2, L2:L1, L1:L2, L2:L3
 *   Outbound L1    → L1:ethereum, L1:polygon, L1:arbitrum, L1:solana, L1:cosmos
 *   Inbound L1     → ethereum:L1, polygon:L1, arbitrum:L1, solana:L1, cosmos:L1
 *
 * Forbidden:
 *   L2→external, L3→external, L3→L1 (must hop via L2)
 */
import type { LayerId, CrossChainRoute, InternalLayerId } from "../types.js";

const VALID_ROUTE_KEYS = new Set<string>([
  // Internal GhostStack hops
  "L3:L2", "L2:L1", "L1:L2", "L2:L3",
  // Outbound from L1 to external chains
  "L1:ethereum", "L1:polygon", "L1:arbitrum", "L1:solana", "L1:cosmos",
  // Inbound from external chains into L1
  "ethereum:L1", "polygon:L1", "arbitrum:L1", "solana:L1", "cosmos:L1",
]);

export function validateRoute(route: CrossChainRoute): void {
  const key = `${route.originLayer}:${route.destination}`;
  if (!VALID_ROUTE_KEYS.has(key)) {
    throw new Error(
      `Sovereignty violation: route "${route.originLayer}" → "${route.destination}" is not permitted. ` +
      `External interactions must originate from GhostChain L1. ` +
      `L3 must route through L2; L2 must route through L1.`,
    );
  }
}

export function isValidRoute(route: CrossChainRoute): boolean {
  try { validateRoute(route); return true; }
  catch { return false; }
}

/** True if the layer is inside the GhostStack (L1, L2, or L3). */
export function isInternalLayer(layer: LayerId): layer is InternalLayerId {
  return layer === "L1" || layer === "L2" || layer === "L3";
}

/**
 * Build and validate a sovereign cross-chain route.
 * Throws SovereigntyViolation if the route bypasses L1.
 */
export function buildSovereignRoute(
  originLayer: LayerId,
  destination: LayerId,
): CrossChainRoute {
  const route: CrossChainRoute = { originLayer, destination };
  validateRoute(route);
  return route;
}

/**
 * For a message originating at `layer`, enforce that any external destination
 * routes via L1. Returns the full corrected route (L3→L2→L1→external, etc.)
 * or throws if there is no valid sovereign path.
 */
export function sovereignPath(
  originLayer: LayerId,
  finalDestination: LayerId,
): CrossChainRoute[] {
  if (originLayer === finalDestination) {
    throw new Error(`Route origin and destination must differ (got "${originLayer}" for both).`);
  }

  const is = isInternalLayer;

  // Direct internal hops (single step)
  if (is(originLayer) && is(finalDestination)) {
    return [buildSovereignRoute(originLayer, finalDestination)];
  }

  // L1 → external (single step)
  if (originLayer === "L1" && !is(finalDestination)) {
    return [buildSovereignRoute("L1", finalDestination)];
  }

  // external → L1 (single step)
  if (!is(originLayer) && finalDestination === "L1") {
    return [buildSovereignRoute(originLayer, "L1")];
  }

  // L2 → external must go via L1 (L2→L1, L1→external)
  if (originLayer === "L2" && !is(finalDestination)) {
    return [
      buildSovereignRoute("L2", "L1"),
      buildSovereignRoute("L1", finalDestination),
    ];
  }

  // L3 → external must go via L2→L1 first
  if (originLayer === "L3" && !is(finalDestination)) {
    return [
      buildSovereignRoute("L3", "L2"),
      buildSovereignRoute("L2", "L1"),
      buildSovereignRoute("L1", finalDestination),
    ];
  }

  throw new Error(
    `No sovereign path from "${originLayer}" to "${finalDestination}". ` +
    `All cross-chain routes must pass through GhostChain L1.`,
  );
}
