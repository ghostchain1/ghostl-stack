/**
 * GhostBrain Core — Routing Law Enforcement
 *
 * NON-NEGOTIABLE HARD INVARIANT (matches RoutingLaw.sol and policy/routing-law.js):
 *   L3 → L2 ONLY
 *   L2 → L1 (GhostChain root) ONLY
 *   L3 → L1 direct: FORBIDDEN
 *   L1 is root — no outbound cross-chain links
 *   External traffic may only originate from L1
 *   BRIDGE intents must be initiated at L1
 */

import { z } from "zod";

export const LayerSchema = z.enum(["L1", "L2", "L3"]);
export const TargetLayerSchema = z.enum(["L1", "L2", "L3", "EXTERNAL"]);
export type Layer = z.infer<typeof LayerSchema>;
export type TargetLayer = z.infer<typeof TargetLayerSchema>;

export const ActionMetaSchema = z.object({
  sourceLayer: LayerSchema,
  targetLayer: TargetLayerSchema,
  intent: z.enum(["TX", "BRIDGE", "READ", "ADMIN"]),
});
export type ActionMeta = z.infer<typeof ActionMetaSchema>;

/**
 * Legal adjacency map — exactly mirrors the on-chain RoutingLaw.sol
 *   L3   → L2 only
 *   L2   → L1 only
 *   L1   → (root, no cross-chain outbound)
 */
const LEGAL_HOP: Record<Layer, TargetLayer | null> = {
  L3: "L2",
  L2: "L1",
  L1: null,
};

export type RoutingResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Enforce the immutable routing law.
 * Returns `{ ok: true }` or `{ ok: false, reason }`.
 *
 * Accepts `unknown` at runtime so callers that bypass TypeScript (e.g. tests
 * with @ts-expect-error, JSON.parse, network input) still get proper
 * schema-validation errors rather than silently passing through.
 */
export function enforceRoutingLaw(meta: ActionMeta | unknown): RoutingResult {
  // Runtime schema validation — catches unknown layers/intents, missing fields, etc.
  const parsed = ActionMetaSchema.safeParse(meta);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `RoutingLaw: invalid input — ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    };
  }

  const { sourceLayer, targetLayer, intent } = parsed.data;

  // Self-loops are never legal
  if (sourceLayer === (targetLayer as string)) {
    return { ok: false, reason: `RoutingLaw: self-loops forbidden (src=${sourceLayer} dst=${targetLayer})` };
  }

  // L1 is root — it may not initiate cross-chain hops to peer layers
  if (sourceLayer === "L1" && (targetLayer === "L2" || targetLayer === "L3")) {
    return { ok: false, reason: `RoutingLaw: L1_IS_ROOT — no outbound cross-chain links (src=L1 dst=${targetLayer})` };
  }

  // Check legal hop adjacency for L3 and L2
  const legalNext = LEGAL_HOP[sourceLayer as Layer];
  if (sourceLayer !== "L1" && targetLayer !== "EXTERNAL") {
    if (legalNext !== targetLayer) {
      return {
        ok: false,
        reason: `RoutingLaw: ${sourceLayer} may only target ${legalNext ?? "(none)"}, got ${targetLayer}`,
      };
    }
  }

  // External egress — only L1 may reach EXTERNAL
  if (targetLayer === "EXTERNAL" && sourceLayer !== "L1") {
    return { ok: false, reason: `RoutingLaw: Only L1 may target EXTERNAL (src=${sourceLayer})` };
  }

  // BRIDGE intents must originate at L1
  if (intent === "BRIDGE" && sourceLayer !== "L1") {
    return { ok: false, reason: `RoutingLaw: BRIDGE intent must be initiated at L1 (src=${sourceLayer})` };
  }

  return { ok: true };
}
