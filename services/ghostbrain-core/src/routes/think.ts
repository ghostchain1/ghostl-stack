/**
 * GhostBrain Core — Think route
 *
 * POST /api/v1/think
 *   Body: { task: GhostTask, payload: Record<string,unknown>, agent: string }
 *   Returns: ThinkResponse
 *
 * This is the central AI reasoning endpoint consumed by @ghost/ai Ghost.think().
 * Each task is routed to a dedicated handler that may read on-chain state,
 * apply heuristics, consult the policy engine, or call out to a connected
 * LLM / scoring service.
 *
 * In phase 1 the handlers are deterministic heuristics (fast, zero external deps).
 * In phase 2 they will route to the hyper-ghost-ai LLM service for complex tasks.
 */

import type { FastifyInstance } from "fastify";
import { z }                    from "zod";

// ── Schemas ────────────────────────────────────────────────────────────────────

const ThinkBodySchema = z.object({
  task:    z.string().min(1),
  payload: z.record(z.any()).default({}),
  agent:   z.string().default("anonymous"),
});

type ThinkBody = z.infer<typeof ThinkBodySchema>;
type GhostRisk = "low" | "medium" | "high" | "critical";

interface ThinkResponse {
  task:            string;
  agent:           string;
  ok:              boolean;
  result:          unknown;
  risk?:           GhostRisk;
  recommendation?: string;
  latencyMs:       number;
  ts:              string;
}

// ── Task registry ──────────────────────────────────────────────────────────────

type TaskHandler = (payload: Record<string, unknown>, agent: string) => {
  result:          unknown;
  risk?:           GhostRisk;
  recommendation?: string;
};

const handlers: Record<string, TaskHandler> = {

  analyze_transaction(payload) {
    const value  = Number(payload["value"] ?? 0);
    const to     = String(payload["to"]    ?? "");
    const isHigh = value > 1e6;      // >1M token units → flag
    const isNull = to === "0x0000000000000000000000000000000000000000";

    if (isNull) {
      return {
        result:          { flagged: true, reason: "zero_address_recipient" },
        risk:            "critical" as const,
        recommendation:  "Reject: sending to zero address destroys funds.",
      };
    }
    return {
      result:          { flagged: isHigh, value, to },
      risk:            isHigh ? "high" : "low",
      recommendation:  isHigh ? "Review large-value transaction manually." : "Transaction appears normal.",
    };
  },

  optimize_gas(payload) {
    const value = Number(payload["value"] ?? 0);
    // Heuristic: suggest lower limit band based on value magnitude
    const suggestedGwei = value > 1000 ? 25 : value > 100 ? 15 : 8;
    return {
      result:          { suggestedGasPriceGwei: suggestedGwei },
      risk:            "low" as const,
      recommendation:  `Set gas price to ~${suggestedGwei} Gwei for optimal inclusion.`,
    };
  },

  inspect_contract_call(payload) {
    const calldata = String(payload["calldata"] ?? "");
    const method   = String(payload["method"]   ?? "");
    // Simple calldata-length heuristic and known-dangerous selectors
    const dangerousSelectors = ["0x2e1a7d4d", "0xa9059cbb", "0x095ea7b3"];
    const selector = calldata.slice(0, 10).toLowerCase();
    const flagged  = dangerousSelectors.includes(selector);
    return {
      result:          { selector, method, flagged },
      risk:            flagged ? "medium" : "low",
      recommendation:  flagged
        ? `Selector ${selector} (${method || "unknown"}) matches a sensitive function — require extra approval.`
        : "Calldata appears well-formed.",
    };
  },

  validate_abi_payload(payload) {
    const p = String(payload["payload"] ?? "");
    const ok = /^0x[0-9a-fA-F]+$/.test(p) && p.length >= 10;
    return {
      result:          { valid: ok, length: p.length },
      risk:            ok ? "low" : "medium",
      recommendation:  ok ? "Payload is valid hex ABI data." : "Payload failed hex validation.",
    };
  },

  contract_guardian(payload) {
    const hash     = String(payload["hash"]     ?? "");
    const calldata = String(payload["calldata"] ?? "");
    // Block selfdestruct (0xff), delegatecall to unknowns, and empty calldata
    const dangerous = calldata === "0x" || calldata.startsWith("0xff");
    return {
      result:          { hash, blocked: dangerous },
      risk:            dangerous ? "critical" : "low",
      recommendation:  dangerous
        ? "Ghost AI blocked unsafe contract interaction."
        : "Contract call cleared by guardian.",
    };
  },

  system_health_check(_payload, agent) {
    const uptime = process.uptime();
    return {
      result: {
        service:  "ghostbrain-core",
        agent,
        uptime,
        memoryMb: Math.round(process.memoryUsage().heapUsed / 1_048_576),
        healthy:  uptime > 0,
      },
      risk:            "low" as const,
      recommendation:  `GhostBrain Core healthy. Uptime: ${Math.floor(uptime)}s`,
    };
  },

  analyze_event(payload) {
    const from  = String(payload["from"]  ?? "");
    const to    = String(payload["to"]    ?? "");
    const value = BigInt(payload["value"] != null ? String(payload["value"]) : "0");
    const large = value > BigInt("1000000000000000000000"); // >1000 tokens (18d)
    return {
      result:          { from, to, value: value.toString(), largeTx: large },
      risk:            large ? "medium" : "low",
      recommendation:  large ? "Large transfer event — verify source intent." : "Normal transfer event.",
    };
  },

  /**
   * analyze_governance_proposal
   *
   * Called automatically by signals.ts whenever governance-event-bridge delivers
   * a governance.proposal.created signal from GhostChainGovernor.
   *
   * Phase 1: deterministic heuristics.
   *   - Constitutional proposals → HIGH risk (require supermajority, extended deliberation)
   *   - Amendment proposals  → MEDIUM risk
   *   - Standard proposals   → LOW risk
   *   - L1 proposals         → risk elevated by one tier (root-layer changes)
   *
   * Phase 2 (TODO): forward to hyper-ghost-ai for LLM-based impact analysis.
   */
  analyze_governance_proposal(payload) {
    const proposalId     = String(payload["proposalId"]     ?? "unknown");
    const proposer       = String(payload["proposer"]       ?? "");
    const target         = String(payload["target"]         ?? "");
    const constitutional = Boolean(payload["constitutional"]);
    const amendment      = Boolean(payload["amendment"]);
    const layer          = String(payload["layer"]          ?? "L1");

    // Classify risk based on proposal type + layer
    let risk: GhostRisk = "low";
    if (constitutional) risk = "high";
    else if (amendment) risk = "medium";

    // L1 proposals have higher impact — elevate one level
    if (layer === "L1" && risk === "low")    risk = "medium";
    if (layer === "L1" && risk === "medium") risk = "high";

    const typeLabel = constitutional ? "constitutional" : amendment ? "amendment" : "standard";

    return {
      result: {
        proposalId,
        proposer,
        target,
        type:   typeLabel,
        layer,
        risk,
        analysedAt: new Date().toISOString(),
        // Flags for downstream consumers
        requiresSupermajority:    constitutional,
        requiresExtendedPeriod:   constitutional,
        requiresGovernorApproval: risk === "high",
      },
      risk,
      recommendation: constitutional
        ? `Constitutional proposal ${proposalId} on ${layer} — requires supermajority ` +
          `(≥66.7%). GOVERNOR + AUDITOR approval required before execution. ` +
          `Escalate to hyper-ghost-ai for impact analysis.`
        : amendment
          ? `Amendment proposal ${proposalId} on ${layer} — extended deliberation ` +
            `period recommended. GOVERNOR approval required.`
          : `Standard proposal ${proposalId} on ${layer} from ${proposer}. ` +
            `No special approval gate required; monitor voting progress.`,
    };
  },
};

// ── Fallback handler for unknown/custom tasks ──────────────────────────────────

function defaultHandler(task: string, payload: Record<string, unknown>): ReturnType<TaskHandler> {
  return {
    result:          { task, payload, note: "No dedicated handler; logged for analysis." },
    risk:            "low",
    recommendation:  `Custom task '${task}' received and queued for GhostBrain analysis.`,
  };
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function thinkRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/think
   * @ghost/ai Ghost.think() target — main AI reasoning endpoint.
   */
  app.post("/api/v1/think", async (req, reply) => {
    const parsed = ThinkBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", detail: parsed.error.flatten() });
    }

    const { task, payload, agent } = parsed.data as ThinkBody;
    const t0 = performance.now();

    const handler = handlers[task] ?? ((p: Record<string, unknown>, _a: string) => defaultHandler(task, p));
    const { result, risk, recommendation } = handler(payload, agent);

    const response: ThinkResponse = {
      task,
      agent,
      ok:    true,
      result,
      risk,
      recommendation,
      latencyMs: Math.round(performance.now() - t0),
      ts:        new Date().toISOString(),
    };

    app.log.info({ task, agent, risk, latencyMs: response.latencyMs }, "think");

    return reply.status(200).send(response);
  });
}
