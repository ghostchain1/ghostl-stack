/**
 * GhostStack Global AI Orchestrator — Validator Agent
 *
 * Monitors the GhostChain validator set, surfaces performance anomalies, and
 * publishes advisory signals to the Validator AI Network and GhostBrain.
 *
 * Responsibilities:
 *   - Track per-validator uptime, signing rate, and missed blocks.
 *   - Detect jailing risk and publish early-warning advisories.
 *   - Relay stake-weight changes to GhostBrain for consensus health scoring.
 *   - Coordinate with the Validator AI Network service at VALIDATOR_AI_URL.
 *
 * Safety boundaries:
 *   - Agent NEVER submits slash or eject transactions — hardware-in-the-loop
 *     required for any punitive action (PolicyGuard hard-denies these tasks).
 *   - All advisories are non-binding; the Validator AI Network owns final
 *     scoring and the GhostChainGovernor owns any on-chain action.
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

const L1_CHAIN_ID        = 14000101 as const;
const AGENT_NAME: AgentName = "validator_agent";

const GHOSTBRAIN_URL     = process.env["GHOSTBRAIN_API_URL"]     ?? "http://localhost:7900";
const VALIDATOR_AI_URL   = process.env["VALIDATOR_AI_URL"]        ?? "http://localhost:7901";

/** Signing-rate below which a validator is flagged as at-risk. */
const JAILING_RISK_THRESHOLD = 0.95;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidatorMetrics {
  address:        string;
  moniker:        string;
  signingRate:    number;   // [0, 1]
  missedBlocks:   number;
  stakedGst:      bigint;
  jailingRisk:    boolean;
  checkedAt:      number;
}

export interface ValidatorAdvisory {
  validatorAddress: string;
  severity:         "INFO" | "WARN" | "CRITICAL";
  message:          string;
  issuedAt:         number;
  chain_id:         number;
  gas_token:        string;
}

export interface ValidatorAgentOptions {
  ghostbrainUrl?:   string;
  validatorAiUrl?:  string;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── ValidatorAgent ────────────────────────────────────────────────────────────

export class ValidatorAgent implements Agent {
  readonly name: AgentName = AGENT_NAME;

  private readonly ghostbrainUrl:  string;
  private readonly validatorAiUrl: string;
  private readonly fetcher:        (url: string, init?: RequestInit) => Promise<Response>;

  private successCount = 0;
  private errorCount   = 0;
  private lastTaskAt:  number | null = null;

  constructor(opts: ValidatorAgentOptions = {}) {
    this.ghostbrainUrl  = opts.ghostbrainUrl  ?? GHOSTBRAIN_URL;
    this.validatorAiUrl = opts.validatorAiUrl ?? VALIDATOR_AI_URL;
    this.fetcher        = opts.fetcher        ?? ((u, i) => fetch(u, i));
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
      console.error(`[ValidatorAgent] Task ${task.id} failed:`, message);
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
      case "sweep_performance":   return this._sweepPerformance(task);
      case "check_validator":     return this._checkValidator(task);
      case "publish_advisory":    return this._publishAdvisory(task);
      default:                    return this._generic(task);
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private async _sweepPerformance(task: Task): Promise<Record<string, unknown>> {
    const res = await this.fetcher(`${this.validatorAiUrl}/validators/sweep`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        task_id:   task.id,
        chain_id:  L1_CHAIN_ID,
        gas_token: "GST",
      }),
    });
    if (!res.ok) throw new Error(`ValidatorAI HTTP ${res.status}`);
    const data = (await res.json()) as { validators?: ValidatorMetrics[] };

    const atRisk = (data.validators ?? []).filter((v) => v.signingRate < JAILING_RISK_THRESHOLD);

    for (const v of atRisk) {
      const advisory: ValidatorAdvisory = {
        validatorAddress: v.address,
        severity:         "WARN",
        message:          `Signing rate below threshold: ${(v.signingRate * 100).toFixed(1)}%`,
        issuedAt:         nowSec(),
        chain_id:         L1_CHAIN_ID,
        gas_token:        "GST",
      };
      void this._sendAdvisory(advisory);
    }

    void this._report("validator/sweep-result", {
      task_id:   task.id,
      at_risk:   atRisk.length,
      total:     (data.validators ?? []).length,
    });

    return { at_risk: atRisk.length, total: (data.validators ?? []).length };
  }

  private async _checkValidator(task: Task): Promise<Record<string, unknown>> {
    const address = String(task.payload["validator_address"] ?? "");
    if (!address) throw new Error("validator_address required");

    const res = await this.fetcher(`${this.validatorAiUrl}/validators/${address}`, {});
    if (!res.ok) throw new Error(`ValidatorAI HTTP ${res.status}`);
    const metrics = (await res.json()) as ValidatorMetrics;

    if (metrics.signingRate < JAILING_RISK_THRESHOLD) {
      const advisory: ValidatorAdvisory = {
        validatorAddress: address,
        severity:         metrics.signingRate < 0.80 ? "CRITICAL" : "WARN",
        message:          `Signing rate ${(metrics.signingRate * 100).toFixed(1)}% — jailing risk`,
        issuedAt:         nowSec(),
        chain_id:         L1_CHAIN_ID,
        gas_token:        "GST",
      };
      void this._sendAdvisory(advisory);
    }

    return { metrics };
  }

  private async _publishAdvisory(task: Task): Promise<Record<string, unknown>> {
    const advisory = task.payload["advisory"] as ValidatorAdvisory | undefined;
    if (!advisory) throw new Error("advisory payload required");
    await this._sendAdvisory(advisory);
    return { published: true };
  }

  private async _generic(task: Task): Promise<Record<string, unknown>> {
    void this._report("validator/generic-task", { task_id: task.id, payload: task.payload });
    console.log(`[ValidatorAgent] Generic task ${task.id}`);
    return { handled: true };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async _sendAdvisory(advisory: ValidatorAdvisory): Promise<void> {
    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/validator/advisory`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(advisory),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[ValidatorAgent] Advisory send failed:", err.message);
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
        console.error("[ValidatorAgent] GhostBrain report failed:", err.message);
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
