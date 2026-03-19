import { keccak256 }            from "@ghostchain/sdk";
import type { GhostStackConfig } from "../config.js";
import { PolicyViolationError }  from "../errors.js";
import type { GhostBrainWS }     from "../ai/GhostBrainWS.js";
import type { GhostLayer, GhostTargetLayer, TxRequest, TxRouteDecision } from "./Types.js";
import { buildDeterministicRoutePlan, normalizeRouteDecision } from "./routing.js";

export class LayerRouter {
  constructor(
    private readonly cfg:   GhostStackConfig,
    private readonly brain: GhostBrainWS
  ) {}

  // ── Policy enforcement ─────────────────────────────────────────────────────

  private enforcePolicy(from: GhostLayer, to: GhostLayer): void {
    if (!this.cfg.policy.enforceGhostOnlyUpstream) return;

    const path  = this.cfg.policy.routingPath;
    const iFrom = path.indexOf(from);
    const iTo   = path.indexOf(to);

    if (iFrom === -1 || iTo === -1) return;

    if (iTo - iFrom > 1) {
      throw new PolicyViolationError(
        `Routing jump not allowed: ${from} → ${to}. ` +
        `Enforced path: ${path.join(" → ")}`,
        { from, to, path }
      );
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Ask GhostBrain for a routing decision.
   * Falls back to deterministic stepwise routing if GhostBrain is offline.
   */
  async decideRoute(params: {
    from:    GhostLayer;
    tx:      TxRequest;
    targetLayer?: GhostTargetLayer;
    intent?: "transfer" | "contract_call" | "bridge" | "governance" | "unknown";
  }): Promise<TxRouteDecision> {
    const { from, tx, intent, targetLayer } = params;
    const desiredTargetLayer = targetLayer ?? from;
    const fallbackPlan = buildDeterministicRoutePlan({
      from,
      targetLayer: desiredTargetLayer,
      routingPath: this.cfg.policy.routingPath,
      reason: "Fallback deterministic routing",
    });

    // Extract 4-byte function selector for GhostBrain's heuristic routing.
    // A valid calldata selector is exactly 0x + 8 hex chars (10 chars total).
    const selector = (tx.data && tx.data.length >= 10)
      ? tx.data.slice(0, 10)
      : "0x";

    const brainReq = {
      type:        "tx_route_decision",
      from,
      intent:      intent ?? "unknown",
      targetLayer: desiredTargetLayer,
      targetAddress: tx.to,
      to:          tx.to,
      value:       tx.value?.toString() ?? "0",
      selector,
      dataHash:    keccak256(tx.data ?? "0x"),
      policyPath:  this.cfg.policy.routingPath,
    };

    try {
      const out = await this.brain.request<TxRouteDecision>(
        "ghost.route.decide",
        brainReq,
        { timeoutMs: 2_500 }
      );
      const normalized = normalizeRouteDecision(out, fallbackPlan);

      // Validate returned plan against policy
      const { path } = normalized.plan;
      for (let i = 0; i < path.length - 1; i++) {
        this.enforcePolicy(path[i]!, path[i + 1]!);
      }
      return normalized;
    } catch {
      for (let i = 0; i < fallbackPlan.path.length - 1; i++) {
        this.enforcePolicy(fallbackPlan.path[i]!, fallbackPlan.path[i + 1]!);
      }

      return {
        plan: fallbackPlan,
        riskScore: fallbackPlan.requiresMessaging ? 0.25 : 0.05,
        notes:     ["GhostBrain unavailable — using deterministic routing."],
      };
    }
  }
}
