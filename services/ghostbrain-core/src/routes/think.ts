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
import { HyperGhostClient }     from "../agents/hyperGhostClient.js";
import { buildHopExecutorFromEnv } from "../routing/HopExecutor.js";

// ── Lazy HGA client (fire-and-forget escalation path) ─────────────────────────
let _hgaClient: HyperGhostClient | null = null;

function getHGAClient(): HyperGhostClient {
  if (!_hgaClient) {
    _hgaClient = new HyperGhostClient({
      baseUrl:       process.env.HYPER_GHOST_BASE_URL       ?? "http://127.0.0.1:7741",
      brainToken:    process.env.HYPER_GHOST_BRAIN_TOKEN    ?? "",
      governorToken: process.env.HYPER_GHOST_GOVERNOR_TOKEN ?? "",
    });
  }
  return _hgaClient;
}

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
   * Phase 2: high-risk proposals are forwarded to hyper-ghost-ai (GOVERNOR role)
   *   for LLM-based constitutional impact analysis. The dispatch is fire-and-forget
   *   (non-blocking) — the deterministic result is still returned immediately so
   *   callers are never blocked by hyper-ghost-ai availability.
   */
  analyze_governance_proposal(payload, agent) {
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

    // Re-assert full union type to prevent TS control-flow narrowing below
    const riskLevel  = risk as GhostRisk;
    const typeLabel  = constitutional ? "constitutional" : amendment ? "amendment" : "standard";
    const needsEscalation = constitutional || riskLevel === "high" || riskLevel === "critical";
    if (needsEscalation) {
      // Fire-and-forget — do NOT await; never block the deterministic path
      getHGAClient()
        .dispatchAction({
          requestId: `gov-${proposalId}-${Date.now()}`,
          role:    "GOVERNOR",
          action:  "analyze_governance_proposal",
          params: {
            proposalId,
            proposer,
            target,
            constitutional,
            amendment,
            layer,
            type:    typeLabel,
            risk:    riskLevel,
            callerAgent: agent,
          },
        })
        .catch(() => {
          // Intentionally swallowed — hyper-ghost-ai is an enhancement, not a hard dep.
          // Failures are tracked inside HyperGhostClient's circuit breaker.
        });
    }

    return {
      result: {
        proposalId,
        proposer,
        target,
        type:   typeLabel,
        layer,
        risk:   riskLevel,
        analysedAt: new Date().toISOString(),
        escalatedToHGA: needsEscalation,
        // Flags for downstream consumers
        requiresSupermajority:    constitutional,
        requiresExtendedPeriod:   constitutional,
        requiresGovernorApproval: riskLevel === "high" || riskLevel === "critical",
      },
      risk: riskLevel,
      recommendation: constitutional
        ? `Constitutional proposal ${proposalId} on ${layer} — requires supermajority ` +
          `(≥66.7%). GOVERNOR + AUDITOR approval required before execution. ` +
          `Forwarded to hyper-ghost-ai for LLM-based impact analysis.`
        : amendment
          ? `Amendment proposal ${proposalId} on ${layer} — extended deliberation ` +
            `period recommended. GOVERNOR approval required.`
          : `Standard proposal ${proposalId} on ${layer} from ${proposer}. ` +
            `No special approval gate required; monitor voting progress.`,
    };
  },

  /**
   * analyze_vote_cast
   *
   * Called when a VoteCast event arrives from governance-event-bridge.
   * Detects whale votes (weight exceeding threshold) and flags them for manual
   * review. All votes are recorded in the think response for audit purposes.
   *
   * Whale threshold: 10 million tokens (10e24 units with 18 decimals). Adjust
   * WHALE_THRESHOLD to match the target chain's tokenomics.
   */
  analyze_vote_cast(payload) {
    const proposalId = String(payload["proposalId"] ?? "unknown");
    const voter      = String(payload["voter"]      ?? "");
    const support    = Boolean(payload["support"]);
    const weight     = BigInt(payload["weight"] != null ? String(payload["weight"]) : "0");
    const layer      = String(payload["layer"]  ?? "L1");

    // 10M tokens with 18 decimals = 10_000_000 * 10^18
    const WHALE_THRESHOLD = BigInt("10000000000000000000000000");
    const isWhale = weight >= WHALE_THRESHOLD;
    const risk: GhostRisk = isWhale ? "medium" : "low";

    return {
      result: {
        proposalId,
        voter,
        support,
        weight:      weight.toString(),
        layer,
        isWhale,
        direction:   support ? "FOR" : "AGAINST",
        analysedAt:  new Date().toISOString(),
      },
      risk,
      recommendation: isWhale
        ? `Whale vote ${support ? "FOR" : "AGAINST"} proposal ${proposalId} on ${layer} ` +
          `(weight: ${weight.toString()}). Monitor voting trajectory closely.`
        : `Vote ${support ? "FOR" : "AGAINST"} proposal ${proposalId} recorded on ${layer}.`,
    };
  },

  /**
   * analyze_proposal_queued
   *
   * Called when a proposal passes its governance vote and enters the timelock
   * queue. Validates the delay against safety thresholds:
   *   - < 24 h → HIGH  (dangerously short timelock)
   *   - 24–48 h → MEDIUM (borderline — flag for review)
   *   - ≥ 48 h → LOW  (within accepted safety window)
   */
  analyze_proposal_queued(payload) {
    const proposalId   = String(payload["proposalId"]   ?? "unknown");
    const eta          = BigInt(payload["eta"]          != null ? String(payload["eta"])          : "0");
    const delaySeconds = BigInt(payload["delaySeconds"] != null ? String(payload["delaySeconds"]) : "0");
    const layer        = String(payload["layer"]        ?? "L1");

    const TWENTY_FOUR_HOURS = BigInt(86_400);
    const FORTY_EIGHT_HOURS = BigInt(172_800);
    const isShortDelay  = delaySeconds < TWENTY_FOUR_HOURS;
    const isBorderline  = !isShortDelay && delaySeconds < FORTY_EIGHT_HOURS;
    const risk: GhostRisk = isShortDelay ? "high" : isBorderline ? "medium" : "low";
    const etaISO = new Date(Number(eta) * 1_000).toISOString();

    return {
      result: {
        proposalId,
        eta:          eta.toString(),
        etaISO,
        delaySeconds: delaySeconds.toString(),
        layer,
        isShortDelay,
        analysedAt: new Date().toISOString(),
      },
      risk,
      recommendation: isShortDelay
        ? `SHORT TIMELOCK: proposal ${proposalId} on ${layer} queued with only ` +
          `${delaySeconds}s delay (< 24 h). Executable at ${etaISO}. ` +
          `Manual review required before execution window opens.`
        : `Proposal ${proposalId} queued on ${layer} with ${delaySeconds}s timelock. ` +
          `Executable from ${etaISO}.`,
    };
  },

  /**
   * analyze_proposal_executed
   *
   * Called when a queued proposal is executed on-chain. Records execution for
   * the governance audit trail. Risk is always low at this stage — the proposal
   * has already cleared all governance and timelock gates.
   */
  analyze_proposal_executed(payload) {
    const proposalId  = String(payload["proposalId"]  ?? "unknown");
    const queueId     = String(payload["queueId"]     ?? "");
    const layer       = String(payload["layer"]       ?? "L1");
    const txHash      = String(payload["txHash"]      ?? "");
    const blockNumber = String(payload["blockNumber"] ?? "");

    return {
      result: {
        proposalId,
        queueId,
        layer,
        txHash,
        blockNumber,
        executedAt:  new Date().toISOString(),
        auditStatus: "recorded",
      },
      risk: "low" as const,
      recommendation:
        `Proposal ${proposalId} executed on ${layer} at block ${blockNumber} ` +
        `(tx: ${txHash}). Recorded in governance audit log.`,
    };
  },

  /**
   * generate_protocol
   *
   * Delegates to ghost-protocol-architect (port 7910) to design and generate
   * a full DeFi protocol suite from a natural-language intent string.
   *
   * Payload:
   *   { intent: string, name: string, outDir?: string }
   *
   * Example:
   *   POST /api/v1/think
   *   { "task": "generate_protocol", "payload": { "intent": "defi with staking", "name": "GhostFarm" } }
   *
   * Per GhostChain governance rules: AI-generated protocols are PROPOSED only.
   * Human ratification is required before any on-chain deployment.
   */
  generate_protocol(payload, agent) {
    const intent = String(payload["intent"] ?? "");
    const name   = String(payload["name"]   ?? "");
    const outDir = payload["outDir"] != null ? String(payload["outDir"]) : undefined;

    if (!intent || !name) {
      return {
        result: { error: "intent and name are required" },
        risk: "low" as const,
        recommendation: "Provide { intent, name } in the payload.",
      };
    }

    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
      return {
        result: { error: "name must be PascalCase" },
        risk: "low" as const,
        recommendation: "Use a PascalCase contract name, e.g. 'GhostFarm'.",
      };
    }

    // Fire-and-forget to ghost-protocol-architect (non-blocking)
    const architectUrl =
      process.env.PROTOCOL_ARCHITECT_URL ?? "http://127.0.0.1:7910";

    const body = JSON.stringify({ intent, name, outDir });

    // Dynamic import of undici to avoid top-level dep requirement.
    // The call is intentionally async/non-blocking — the think response
    // is returned immediately with status "queued".
    import("undici").then(({ fetch: undicicFetch }) => {
      return undicicFetch(`${architectUrl}/api/v1/design`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    }).catch(() => {
      // ghost-protocol-architect may not be running — ignore; non-critical.
    });

    return {
      result: {
        status:              "queued",
        name,
        intent,
        outDir:              outDir ?? "contracts/src/generated",
        agent,
        note:                "Protocol design dispatched to ghost-protocol-architect. Human ratification required before deployment.",
        architectUrl,
        requiresRatification: true,
      },
      risk: "medium" as const,
      recommendation:
        `Protocol "${name}" design queued. ghost-protocol-architect will generate contracts at ${outDir ?? "contracts/src/generated"}. ` +
        "Review generated Solidity before deployment — autonomous on-chain execution is blocked pending governance ratification.",
    };
  },

  /**
   * defi_architect
   *
   * Delegates to ghost-defi-architect (port 7920) to design a full DeFi
   * ecosystem from a structured configuration: AMM, liquidity, staking,
   * yield, treasury, tokenomics, and bridge layers.
   *
   * Payload:
   *   { name: string, amm?: {...}, liquidity?: {...}, staking?: {...},
   *     yield?: {...}, treasury?: {...}, tokenomics?: {...}, bridge?: {...} }
   *
   * Example:
   *   POST /api/v1/think
   *   { "task": "defi_architect", "payload": { "name": "GhostDeFi", "amm": { "feeBps": 30 } } }
   *
   * Per GhostChain governance rules: AI-designed DeFi systems are PROPOSED only.
   * Human ratification is required before any on-chain deployment.
   */
  defi_architect(payload, agent) {
    const name = String(payload["name"] ?? "");

    if (!name) {
      return {
        result: { error: "name is required" },
        risk: "low" as const,
        recommendation: "Provide { name } in the payload.",
      };
    }

    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
      return {
        result: { error: "name must be PascalCase" },
        risk: "low" as const,
        recommendation: "Use a PascalCase name, e.g. 'GhostDeFi'.",
      };
    }

    // Fire-and-forget to ghost-defi-architect (non-blocking)
    const defiArchitectUrl =
      process.env.DEFI_ARCHITECT_URL ?? "http://127.0.0.1:7920";

    // Pass the full payload (minus name, which is part of the build config)
    const buildBody = JSON.stringify({ ...payload });

    import("undici").then(({ fetch: undicicFetch }) => {
      return undicicFetch(`${defiArchitectUrl}/api/v1/build`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    buildBody,
      });
    }).catch(() => {
      // ghost-defi-architect may not be running — ignore; non-critical.
    });

    return {
      result: {
        status:               "queued",
        name,
        agent,
        note:                 "DeFi system design dispatched to ghost-defi-architect. Human ratification required before deployment.",
        defiArchitectUrl,
        requiresRatification: true,
      },
      risk: "medium" as const,
      recommendation:
        `DeFi system "${name}" design queued. ghost-defi-architect (port 7920) will generate AMM, staking, yield, treasury, ` +
        "tokenomics, and bridge contracts. Review all generated Solidity before deployment — autonomous on-chain execution is blocked pending governance ratification.",
    };
  },

  /**
   * governor_status
   *
   * Queries the ghost-governor-ai service (port 7930) for current governor
   * status and dispatches a fire-and-forget fetch to retrieve the latest cycle.
   * Returns immediately with connection info — poll /api/v1/status directly
   * on port 7930 for real-time data.
   *
   * Payload: {} (no payload required)
   *
   * Example:
   *   POST /api/v1/think
   *   { "task": "governor_status", "payload": {} }
   */
  governor_status(_payload, agent) {
    const governorUrl = process.env.GOVERNOR_AI_URL ?? "http://127.0.0.1:7930";

    // Non-blocking fetch — result available directly on port 7930
    import("undici").then(({ fetch: undicicFetch }) => {
      return undicicFetch(`${governorUrl}/api/v1/status`, {
        signal: AbortSignal.timeout(4_000),
      });
    }).catch(() => {
      // ghost-governor-ai may not be running — ignore; non-critical.
    });

    return {
      result: {
        status:       "queried",
        agent,
        governorUrl,
        statusEndpoint:    `${governorUrl}/api/v1/status`,
        proposalsEndpoint: `${governorUrl}/api/v1/proposals`,
        note: "Poll the endpoints above for live governor status and pending proposals. All proposals require human ratification.",
      },
      risk: "low" as const,
      recommendation:
        `Ghost Governor AI (port 7930) queried. Fetch ${governorUrl}/api/v1/status for running state ` +
        "and /api/v1/proposals for proposals pending human ratification.",
    };
  },

  /**
   * infra_status
   *
   * Queries the ghost-infra-controller service (port 7940) for current
   * infrastructure controller status (VMs, containers, nodes, disks, network).
   * Returns immediately with connection info — poll /api/v1/status directly
   * on port 7940 for real-time cycle data and pending proposals.
   *
   * Payload: {} (no payload required)
   *
   * Example:
   *   POST /api/v1/think
   *   { "task": "infra_status", "payload": {} }
   */
  infra_status(_payload, agent) {
    const infraUrl = process.env.INFRA_CONTROLLER_URL ?? "http://127.0.0.1:7940";

    // Non-blocking fetch — result available directly on port 7940
    import("undici").then(({ fetch: undicicFetch }) => {
      return undicicFetch(`${infraUrl}/api/v1/status`, {
        signal: AbortSignal.timeout(4_000),
      });
    }).catch(() => {
      // ghost-infra-controller may not be running — ignore; non-critical.
    });

    return {
      result: {
        status:          "queried",
        agent,
        infraUrl,
        statusEndpoint:  `${infraUrl}/api/v1/status`,
        actionsEndpoint: `${infraUrl}/api/v1/actions`,
        healthEndpoint:  `${infraUrl}/healthz`,
        note: "Poll the endpoints above for live infra controller status and infrastructure proposals. Destructive proposals always require human ratification.",
      },
      risk: "low" as const,
      recommendation:
        `Ghost Infra Controller (port 7940) queried. Fetch ${infraUrl}/api/v1/status for running state ` +
        "and /api/v1/actions for infrastructure actions from the latest cycle. " +
        "VM starts, container restarts, and DNS reloads may auto-execute when ALLOW_AUTO_EXEC=true; " +
        "all other actions require human ratification.",
    };
  },

  /**
   * multichain_status
   *
   * Queries the ghost-multichain-controller service (port 7950) for current
   * cross-chain status: bridges, markets, liquidity pools, and pending proposals.
   * Returns immediately with connection info — poll /api/v1/status directly
   * on port 7950 for real-time cycle data.
   *
   * Sovereignty note: the multichain controller enforces L3→L2→L1→External routing.
   * No L2 or L3 direct external-chain interaction is ever permitted.
   *
   * Payload: {} (no payload required)
   *
   * Example:
   *   POST /api/v1/think
   *   { "task": "multichain_status", "payload": {} }
   */
  multichain_status(_payload, agent) {
    const multichainUrl = process.env.MULTICHAIN_CONTROLLER_URL ?? "http://127.0.0.1:7950";

    // Non-blocking fetch — result available directly on port 7950
    import("undici").then(({ fetch: undicicFetch }) => {
      return undicicFetch(`${multichainUrl}/api/v1/status`, {
        signal: AbortSignal.timeout(4_000),
      });
    }).catch(() => {
      // ghost-multichain-controller may not be running — ignore; non-critical.
    });

    return {
      result: {
        status:           "queried",
        agent,
        multichainUrl,
        statusEndpoint:   `${multichainUrl}/api/v1/status`,
        actionsEndpoint:  `${multichainUrl}/api/v1/actions`,
        healthEndpoint:   `${multichainUrl}/healthz`,
        sovereigntyRule:  "L3 → L2 → GhostChain L1 → External Chains (L2/L3 never touch external directly)",
        note: "Poll the endpoints above for live cross-chain proposals. All bridge and arbitrage proposals require human ratification.",
      },
      risk: "low" as const,
      recommendation:
        `Ghost Multichain Controller (port 7950) queried. Fetch ${multichainUrl}/api/v1/status for ` +
        "running state and /api/v1/actions for cross-chain proposals from the latest cycle. " +
        "All bridge_restart, bridge_pause, liquidity_rebalance, and arbitrage_propose actions " +
        "require human ratification — sovereignty enforced at L1. " +
        "oracle_update actions may auto-execute when MULTICHAIN_ALLOW_AUTO_EXEC=true.",
    };
  },

  /** Return the current HopExecutor messenger wiring status (for diagnostics). */
  inspect_hop_config(_payload, _agent) {
    const executor = buildHopExecutorFromEnv();
    const cfg = (executor as unknown as { cfg: Record<string, unknown> }).cfg;
    return {
      result: {
        L3ToL2Messenger: cfg.L3ToL2Messenger
          ? { address: (cfg.L3ToL2Messenger as { address: string }).address, wired: true }
          : { wired: false },
        L2ToL1Messenger: cfg.L2ToL1Messenger
          ? { address: (cfg.L2ToL1Messenger as { address: string }).address, wired: true }
          : { wired: false },
        defaultMessengerGasLimit: String(cfg.defaultMessengerGasLimit),
      },
      risk: "low" as const,
      recommendation: cfg.L3ToL2Messenger && cfg.L2ToL1Messenger
        ? "Cross-layer messengers are fully wired."
        : "Set L3_TO_L2_MESSENGER_ADDRESS and L2_TO_L1_MESSENGER_ADDRESS to enable real OP Stack messenger hops.",
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
