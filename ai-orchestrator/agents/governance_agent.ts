/**
 * GhostStack Global AI Orchestrator — Governance Agent
 *
 * Monitors and coordinates governance across GhostChain L1, GhostL2, and
 * GhostL3.  Also handles SECURITY-type tasks that PolicyGuard escalates here
 * for mandatory human review.
 *
 * Responsibilities:
 *   - Poll GhostChainGovernor for active proposals (EVM + Cosmos gov).
 *   - Detect low participation, routing bypasses, and quorum anomalies.
 *   - Relay security anomalies from GhostBrain to the governance queue for
 *     human-ratification before any on-chain action.
 *   - Coordinate with Governance AI Engine for proposal simulation.
 *   - Surface advisory signals to GhostBrain Sentinel.
 *
 * Safety boundaries:
 *   - Agent NEVER submits, votes on, or executes governance proposals.
 *   - All outputs are advisory (advisory flag = true, simulation_only = true).
 *   - Routing-bypass detection publishes to signing relay for human review,
 *     never triggers autonomous circuit-breaking.
 *   - SECURITY tasks are logged and forwarded to humans — never self-remediated.
 *
 * Services consumed:
 *   - GhostBrain Core        :7900  /api/v1/governance/proposals
 *   - Cosmos LCD             :1317  /cosmos/gov/v1beta1/proposals
 *   - Governance AI Engine   :7690  (advisory simulation)
 *   - Signing Relay          :7910  (advisory proposals queue)
 *
 * Chain: GhostChain L1 (chain_id 14000101). Gas token: GST.
 */

import type {
  Agent,
  AgentHealth,
  AgentName,
  AgentResult,
  Task,
} from "../core/task_router.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const L1_CHAIN_ID   = 14000101 as const;
const L2_CHAIN_ID   = 901       as const;
const L3_CHAIN_ID   = 903       as const;
const AGENT_NAME: AgentName = "governance_agent";

const GHOSTBRAIN_URL     = process.env["GHOSTBRAIN_API_URL"]     ?? "http://localhost:7900";
const COSMOS_LCD_URL     = process.env["COSMOS_LCD_URL"]         ?? "http://localhost:1317";
const GOV_AI_URL         = process.env["GOV_AI_URL"]             ?? "http://localhost:7690";
const SIGNING_RELAY_URL  = process.env["SIGNING_RELAY_URL"]      ?? "http://localhost:7910";

/** Low-participation threshold — flag if participation < 5% with < 24h left. */
const LOW_PARTICIPATION_PCT    = 5;
const LOW_PARTICIPATION_WINDOW = 24 * 60 * 60;   // seconds

/** Cosmos proposal status: PROPOSAL_STATUS_VOTING_PERIOD */
const COSMOS_VOTING_STATUS = "PROPOSAL_STATUS_VOTING_PERIOD";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GovernanceProposal {
  id:                string;
  title:             string;
  status:            string;
  votingEndTime:     number | null;  // Unix seconds
  participationPct:  number | null;
  originChainId:     number;
  targetChainId:     number;
  isRoutingBypass:   boolean;        // L3 → L1 without L2 settlement = CRITICAL
  source:            "evm" | "cosmos";
}

export interface GovernanceAdvisory {
  severity:    "INFO" | "WARN" | "CRITICAL";
  proposal_id: string;
  message:     string;
  data:        Record<string, unknown>;
  issuedAt:    number;
  chain_id:    number;
  gas_token:   string;
  simulation_only: boolean;
  advisory:        boolean;
}

export interface SecurityEscalation {
  taskId:   string;
  severity: "WARN" | "CRITICAL";
  finding:  Record<string, unknown>;
  issuedAt: number;
  chain_id: number;
}

export interface GovernanceAgentOptions {
  ghostbrainUrl?:    string;
  cosmosLcdUrl?:     string;
  govAiUrl?:         string;
  signingRelayUrl?:  string;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── CosmosProposal (partial shape from LCD) ───────────────────────────────────

interface CosmosProposalRaw {
  proposal_id?:     string;
  id?:              string;
  content?:         { title?: string };
  status?:          string;
  voting_end_time?: string;
  final_tally_result?: {
    yes?: string;
    no?:  string;
    abstain?: string;
    no_with_veto?: string;
  };
}

// ── GovernanceAgent ───────────────────────────────────────────────────────────

export class GovernanceAgent implements Agent {
  readonly name: AgentName = AGENT_NAME;

  private readonly ghostbrainUrl:   string;
  private readonly cosmosLcdUrl:    string;
  private readonly govAiUrl:        string;
  private readonly signingRelayUrl: string;
  private readonly fetcher:         (url: string, init?: RequestInit) => Promise<Response>;

  private successCount = 0;
  private errorCount   = 0;
  private lastTaskAt:  number | null = null;

  constructor(opts: GovernanceAgentOptions = {}) {
    this.ghostbrainUrl   = opts.ghostbrainUrl   ?? GHOSTBRAIN_URL;
    this.cosmosLcdUrl    = opts.cosmosLcdUrl    ?? COSMOS_LCD_URL;
    this.govAiUrl        = opts.govAiUrl        ?? GOV_AI_URL;
    this.signingRelayUrl = opts.signingRelayUrl ?? SIGNING_RELAY_URL;
    this.fetcher         = opts.fetcher         ?? ((u, i) => fetch(u, i));
  }

  // ── Agent interface ────────────────────────────────────────────────────────

  async handle(task: Task): Promise<AgentResult> {
    this.lastTaskAt = nowSec();
    try {
      const output = await this._dispatch(task);
      this.successCount += 1;
      return this._result(task, true, output);
    } catch (err: unknown) {
      this.errorCount += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[GovernanceAgent] Task ${task.id} failed:`, message);
      return this._result(task, false, { error: message });
    }
  }

  health(): AgentHealth {
    return {
      name:         AGENT_NAME,
      healthy:      this.errorCount < 5,
      lastTaskAt:   this.lastTaskAt,
      errorCount:   this.errorCount,
      successCount: this.successCount,
    };
  }

  // ── Task dispatch ──────────────────────────────────────────────────────────

  private async _dispatch(task: Task): Promise<Record<string, unknown>> {
    const action = task.payload["action"];
    switch (action) {
      case "check_proposals":       return this._checkProposals(task);
      case "flag_routing_bypass":   return this._flagRoutingBypass(task);
      case "submit_advisory":       return this._submitAdvisory(task);
      case "escalate_security":     return this._escalateSecurity(task);
      default:
        // SECURITY task type (no explicit action) → escalate
        if (task.type === "SECURITY")
          return this._escalateSecurity(task);
        return this._generic(task);
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  /** Poll all active governance proposals from GhostBrain + Cosmos LCD. */
  private async _checkProposals(task: Task): Promise<Record<string, unknown>> {
    const [evmProps, cosmosProps] = await Promise.allSettled([
      this._fetchEvmProposals(),
      this._fetchCosmosProposals(),
    ]);

    const proposals: GovernanceProposal[] = [
      ...(evmProps.status    === "fulfilled" ? evmProps.value    : []),
      ...(cosmosProps.status === "fulfilled" ? cosmosProps.value : []),
    ];

    const now = nowSec();
    for (const p of proposals) {
      // Check for routing bypass
      if (p.isRoutingBypass) {
        void this._sendAdvisory({
          severity:    "CRITICAL",
          proposal_id: p.id,
          message:     `Routing bypass detected: proposal ${p.id} from L3 targets L1 without L2 settlement`,
          data:        { originChain: p.originChainId, targetChain: p.targetChainId },
          issuedAt:    now,
          chain_id:    L1_CHAIN_ID,
          gas_token:   "GST",
          simulation_only: true,
          advisory:        true,
        });
      }

      // Check for low participation near deadline
      const timeLeft = p.votingEndTime !== null ? p.votingEndTime - now : Infinity;
      if (
        p.participationPct !== null &&
        p.participationPct < LOW_PARTICIPATION_PCT &&
        timeLeft < LOW_PARTICIPATION_WINDOW
      ) {
        void this._sendAdvisory({
          severity:    "WARN",
          proposal_id: p.id,
          message:     `Low participation ${p.participationPct.toFixed(1)}% with ${Math.floor(timeLeft / 3600)}h remaining`,
          data:        { participationPct: p.participationPct, timeLeft_s: timeLeft },
          issuedAt:    now,
          chain_id:    L1_CHAIN_ID,
          gas_token:   "GST",
          simulation_only: true,
          advisory:        true,
        });
      }
    }

    void this._report("governance/proposals-checked", {
      total:         proposals.length,
      bypasses:      proposals.filter((p) => p.isRoutingBypass).length,
      low_part:      proposals.filter((p) => (p.participationPct ?? 100) < LOW_PARTICIPATION_PCT).length,
      task_id:       task.id,
    });

    return {
      proposals: proposals.map((p) => ({
        id:               p.id,
        status:           p.status,
        participationPct: p.participationPct,
        isRoutingBypass:  p.isRoutingBypass,
        source:           p.source,
      })),
    };
  }

  /** Explicit routing-bypass check — called when the infra/swarm flags suspect cross-chain payload. */
  private async _flagRoutingBypass(task: Task): Promise<Record<string, unknown>> {
    const proposalId = String(task.payload["proposal_id"] ?? "unknown");
    const originChain = Number(task.payload["origin_chain_id"] ?? L3_CHAIN_ID);
    const targetChain = Number(task.payload["target_chain_id"] ?? L1_CHAIN_ID);

    const isBypass = originChain === L3_CHAIN_ID && targetChain === L1_CHAIN_ID;

    if (isBypass) {
      void this._sendAdvisory({
        severity:    "CRITICAL",
        proposal_id: proposalId,
        message:     `L3→L1 routing bypass confirmed for proposal ${proposalId}. Requires L2 settlement step.`,
        data:        { originChain, targetChain },
        issuedAt:    nowSec(),
        chain_id:    L1_CHAIN_ID,
        gas_token:   "GST",
        simulation_only: true,
        advisory:        true,
      });
      void this._submitToRelay(proposalId, "routing_bypass_flag", {
        origin_chain: originChain,
        target_chain: targetChain,
        task_id:      task.id,
      });
    }

    return { isBypass, proposalId, originChain, targetChain };
  }

  /** Relay an advisory proposal to the signing relay for human review. */
  private async _submitAdvisory(task: Task): Promise<Record<string, unknown>> {
    const advisory = task.payload["advisory"] as GovernanceAdvisory | undefined;
    if (!advisory) throw new Error("advisory payload required");
    await this._sendAdvisory(advisory);
    return { sent: true };
  }

  /**
   * Handle SECURITY task escalation.
   * Logs the finding, notifies GhostBrain Sentinel, and queues for human review.
   * Never auto-remediates.
   */
  private async _escalateSecurity(task: Task): Promise<Record<string, unknown>> {
    const finding = task.payload as Record<string, unknown>;
    const escalation: SecurityEscalation = {
      taskId:   task.id,
      severity: task.priority === "CRITICAL" ? "CRITICAL" : "WARN",
      finding,
      issuedAt: nowSec(),
      chain_id: L1_CHAIN_ID,
    };

    console.warn(
      `[GovernanceAgent] SECURITY escalation task=${task.id} severity=${escalation.severity}`,
    );

    void this._report("governance/security-escalation", {
      ...escalation,
      gas_token:       "GST",
      requires_human:  true,
      simulation_only: true,
    });

    void this._submitToRelay(task.id, "security_escalation", {
      severity:        escalation.severity,
      finding:         finding,
      requires_human:  true,
      simulation_only: true,
      chain_id:        L1_CHAIN_ID,
      gas_token:       "GST",
    });

    return { escalated: true, severity: escalation.severity };
  }

  private async _generic(task: Task): Promise<Record<string, unknown>> {
    void this._report("governance/generic-task", { task_id: task.id, payload: task.payload });
    console.log(`[GovernanceAgent] Generic task ${task.id} type=${task.type}`);
    return { handled: true };
  }

  // ── Data fetchers ──────────────────────────────────────────────────────────

  private async _fetchEvmProposals(): Promise<GovernanceProposal[]> {
    const res = await this.fetcher(
      `${this.ghostbrainUrl}/api/v1/governance/proposals?chain_id=${L1_CHAIN_ID}`,
      {},
    );
    if (!res.ok) throw new Error(`GhostBrain HTTP ${res.status}`);
    const data = (await res.json()) as { proposals?: Array<Record<string, unknown>> };
    return (data.proposals ?? []).map((p) => this._normalizeEvmProposal(p));
  }

  private async _fetchCosmosProposals(): Promise<GovernanceProposal[]> {
    const url = `${this.cosmosLcdUrl}/cosmos/gov/v1beta1/proposals?proposal_status=2`;
    const res = await this.fetcher(url, {});
    if (!res.ok) throw new Error(`Cosmos LCD HTTP ${res.status}`);
    const data = (await res.json()) as { proposals?: CosmosProposalRaw[] };
    return (data.proposals ?? []).map((p) => this._normalizeCosmosProposal(p));
  }

  // ── Normalizers ────────────────────────────────────────────────────────────

  private _normalizeEvmProposal(raw: Record<string, unknown>): GovernanceProposal {
    const originChain  = Number(raw["origin_chain_id"]  ?? L1_CHAIN_ID);
    const targetChain  = Number(raw["target_chain_id"]  ?? L1_CHAIN_ID);
    const isRoutingBypass = originChain === L3_CHAIN_ID && targetChain === L1_CHAIN_ID;

    let endTime: number | null = null;
    if (typeof raw["voting_end"] === "number") endTime = raw["voting_end"] as number;
    else if (typeof raw["voting_end"] === "string") endTime = Math.floor(new Date(raw["voting_end"] as string).getTime() / 1000);

    return {
      id:               String(raw["id"] ?? raw["proposal_id"] ?? "unknown"),
      title:            String(raw["title"] ?? ""),
      status:           String(raw["status"] ?? ""),
      votingEndTime:    endTime,
      participationPct: raw["participation_pct"] !== undefined ? Number(raw["participation_pct"]) : null,
      originChainId:    originChain,
      targetChainId:    targetChain,
      isRoutingBypass,
      source:           "evm",
    };
  }

  private _normalizeCosmosProposal(raw: CosmosProposalRaw): GovernanceProposal {
    let endTime: number | null = null;
    if (raw.voting_end_time)
      endTime = Math.floor(new Date(raw.voting_end_time).getTime() / 1000);

    // Simple participation estimate from tally (yes+no+abstain+veto votes ≠ 0)
    const tally = raw.final_tally_result;
    const totalVotes = tally
      ? [tally.yes, tally.no, tally.abstain, tally.no_with_veto]
          .reduce((sum, v) => sum + BigInt(v ?? "0"), 0n)
      : 0n;
    // Cosmos does not expose quorum directly; we surface raw vote count
    const participationPct = totalVotes > 0n ? null : 0;

    return {
      id:               String(raw.proposal_id ?? raw.id ?? "unknown"),
      title:            raw.content?.title ?? "",
      status:           raw.status ?? "",
      votingEndTime:    endTime,
      participationPct,
      originChainId:    L1_CHAIN_ID,
      targetChainId:    L1_CHAIN_ID,
      isRoutingBypass:  false,
      source:           "cosmos",
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async _sendAdvisory(advisory: GovernanceAdvisory): Promise<void> {
    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/governance/advisory`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(advisory),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[GovernanceAgent] Advisory send failed:", err.message);
    }
  }

  private async _submitToRelay(
    id:     string,
    kind:   string,
    data:   Record<string, unknown>,
  ): Promise<void> {
    const body = {
      source:              "governance_agent",
      kind,
      id,
      data,
      simulation_only:     true,
      requires_human_review: true,
      timestamp:           nowSec(),
      chain_id:            L1_CHAIN_ID,
      gas_token:           "GST",
    };
    try {
      const res = await this.fetcher(`${this.signingRelayUrl}/proposals`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[GovernanceAgent] Relay submit failed:", err.message);
    }
  }

  private async _report(endpoint: string, data: Record<string, unknown>): Promise<void> {
    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/${endpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...data, chain_id: L1_CHAIN_ID, gas_token: "GST" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[GovernanceAgent] GhostBrain report failed:", err.message);
    }
  }

  private _result(
    task:    Task,
    success: boolean,
    output:  Record<string, unknown>,
  ): AgentResult {
    return {
      taskId:    task.id,
      agentName: AGENT_NAME,
      success,
      output,
      handledAt: nowSec(),
      chain_id:  L1_CHAIN_ID,
      gas_token: "GST",
    };
  }
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
