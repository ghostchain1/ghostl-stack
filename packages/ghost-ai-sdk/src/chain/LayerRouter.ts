import { keccak256 }            from "ethers";
import type { GhostStackConfig } from "../config.js";
import { PolicyViolationError }  from "../errors.js";
import type { GhostBrainWS }     from "../ai/GhostBrainWS.js";
import type { GhostLayer, TxRequest, TxRouteDecision } from "./Types.js";

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
    intent?: "transfer" | "contract_call" | "bridge" | "governance" | "unknown";
  }): Promise<TxRouteDecision> {
    const { from, tx, intent } = params;

    // Extract 4-byte function selector for GhostBrain's heuristic routing.
    // A valid calldata selector is exactly 0x + 8 hex chars (10 chars total).
    const selector = (tx.data && tx.data.length >= 10)
      ? tx.data.slice(0, 10)
      : "0x";

    const brainReq = {
      type:        "tx_route_decision",
      from,
      intent:      intent ?? "unknown",
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

      // Validate returned plan against policy
      const { path } = out.plan;
      for (let i = 0; i < path.length - 1; i++) {
        this.enforcePolicy(path[i]!, path[i + 1]!);
      }
      return out;
    } catch {
      // Deterministic fallback
      const fullPath = this.cfg.policy.routingPath;
      const idx      = fullPath.indexOf(from);
      const planPath = (idx >= 0 ? fullPath.slice(idx) : [from, "L2" as GhostLayer, "L1" as GhostLayer]);

      for (let i = 0; i < planPath.length - 1; i++) {
        this.enforcePolicy(planPath[i]!, planPath[i + 1]!);
      }

      return {
        plan: {
          path:              planPath,
          executeOn:         from,
          requiresMessaging: planPath.length > 1,
          reason:            "Fallback deterministic routing",
        },
        riskScore: 0.25,
        notes:     ["GhostBrain unavailable — using deterministic routing."],
      };
    }
  }
}
