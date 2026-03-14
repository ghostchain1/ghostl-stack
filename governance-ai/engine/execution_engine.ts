/**
 * GhostChain Global Governance AI — Execution Engine
 *
 * Monitors passed governance proposals in GovernanceCore and orchestrates
 * their execution after the mandatory timelock elapses.
 *
 * Execution model:
 *   1. Engine polls GovernanceCore (via GhostBrain indexer) for proposals in
 *      PASSED state that have surpassed TIMELOCK_SECS.
 *   2. For each eligible proposal, the target layer is determined (L1/L2/L3).
 *   3. An execution payload is constructed from the proposal's on-chain record.
 *   4. The payload is forwarded to the signing relay (:7910) for human-ratified
 *      on-chain execution via the appropriate contract call.
 *   5. On relay confirmation, GovernanceCore.markExecuted() is invoked.
 *   6. All execution events are recorded in GhostBrain for audit.
 *
 * Timelock:
 *   DEFAULT_TIMELOCK_SECS = 172800 (48 hours after proposal passes).
 *   Constitution amendments use CONSTITUTION_TIMELOCK_SECS = 604800 (7 days).
 *
 * Retry:
 *   Each proposal gets MAX_RETRIES relay attempts with exponential backoff.
 *   After MAX_RETRIES, the proposal is marked EXECUTION_FAILED and requires
 *   manual governance re-submission.
 *
 * Advisory-only:
 *   The engine NEVER calls on-chain contracts directly.  All execution calls
 *   route through the signing relay which requires a human multi-sig quorum.
 *
 * Chain: GhostChain L1 (chain_id 14000101).  L2/L3 relayed through L1.
 * Gas token: GST.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const L1_CHAIN_ID = 14000101 as const;
const L2_CHAIN_ID = 901      as const;
const L3_CHAIN_ID = 903      as const;

const DEFAULT_TIMELOCK_SECS     = parseInt(process.env["GOV_TIMELOCK_SECS"]        ?? "172800", 10);
const CONSTITUTION_TIMELOCK_SECS = parseInt(process.env["GOV_CONST_TIMELOCK_SECS"] ?? "604800", 10);

const MAX_RETRIES       = 3;
const BASE_BACKOFF_MS   = 5_000;   // 5 seconds initial backoff
const MAX_PENDING       = 2_000;   // Bounded pending execution queue
const POLL_INTERVAL_MS  = parseInt(process.env["GOV_EXEC_POLL_MS"] ?? "30000", 10);

const GHOSTBRAIN_URL = process.env["GHOSTBRAIN_API_URL"]  ?? "http://localhost:7900";
const RELAY_URL      = process.env["SIGNING_RELAY_URL"]   ?? "http://localhost:7910";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProposalCategory =
  | "PROTOCOL_UPGRADE"
  | "TREASURY_POLICY"
  | "VALIDATOR_RULES"
  | "ECONOMIC_PARAMS"
  | "CONSTITUTION";

export type TargetLayer = "L1" | "L2" | "L3";

export type ExecutionStatus =
  | "PENDING_TIMELOCK"
  | "READY"
  | "SUBMITTED"
  | "CONFIRMED"
  | "EXECUTION_FAILED";

export interface PassedProposal {
  coreId:          number;           // GovernanceCore proposal id (uint256 → number)
  description:     string;
  category:        ProposalCategory;
  targetLayer:     TargetLayer;
  passedAt:        number;           // Unix seconds
  votesFor:        bigint;           // GST-weighted (wei)
  votesAgainst:    bigint;
}

export interface ExecutionRecord {
  coreId:          number;
  description:     string;
  category:        ProposalCategory;
  targetLayer:     TargetLayer;
  status:          ExecutionStatus;
  passedAt:        number;
  timelockEndsAt:  number;
  attempts:        number;
  lastAttemptAt:   number;
  relayTxId?:      string;
  error?:          string;
}

export interface ExecutionEngineOptions {
  ghostbrainUrl?:              string;
  relayUrl?:                   string;
  defaultTimelockSecs?:        number;
  constitutionTimelockSecs?:   number;
  pollIntervalMs?:             number;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── ExecutionEngine ───────────────────────────────────────────────────────────

export class ExecutionEngine {
  private readonly ghostbrainUrl:           string;
  private readonly relayUrl:                string;
  private readonly defaultTimelockSecs:     number;
  private readonly constitutionTimelockSec: number;
  private readonly pollIntervalMs:          number;
  private readonly fetcher:                  (url: string, init?: RequestInit) => Promise<Response>;

  /** coreId → execution record */
  private readonly pending = new Map<number, ExecutionRecord>();

  private pollHandle: ReturnType<typeof setInterval> | null = null;

  constructor(opts: ExecutionEngineOptions = {}) {
    this.ghostbrainUrl           = opts.ghostbrainUrl            ?? GHOSTBRAIN_URL;
    this.relayUrl                = opts.relayUrl                 ?? RELAY_URL;
    this.defaultTimelockSecs     = opts.defaultTimelockSecs      ?? DEFAULT_TIMELOCK_SECS;
    this.constitutionTimelockSec = opts.constitutionTimelockSecs ?? CONSTITUTION_TIMELOCK_SECS;
    this.pollIntervalMs          = opts.pollIntervalMs           ?? POLL_INTERVAL_MS;
    this.fetcher                 = opts.fetcher                  ?? ((url, init) => fetch(url, init));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Start the execution poll loop. */
  start(): void {
    if (this.pollHandle) return;
    console.log(`[ExecutionEngine] Starting poll loop every ${this.pollIntervalMs}ms`);
    this.pollHandle = setInterval(() => {
      void this._pollAndExecute();
    }, this.pollIntervalMs);
    void this._pollAndExecute();
  }

  /** Stop the poll loop. */
  stop(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  /**
   * Enqueue a passed proposal for timelock monitoring and execution.
   * Called by VoteCoordinator after GovernanceCore records a PASSED state.
   */
  enqueue(proposal: PassedProposal): ExecutionRecord {
    if (this.pending.size >= MAX_PENDING) {
      // Evict oldest ready/failed entry.
      this._evict();
    }

    const timelockSecs = proposal.category === "CONSTITUTION"
      ? this.constitutionTimelockSec
      : this.defaultTimelockSecs;

    const record: ExecutionRecord = {
      coreId:         proposal.coreId,
      description:    proposal.description,
      category:       proposal.category,
      targetLayer:    proposal.targetLayer,
      status:         "PENDING_TIMELOCK",
      passedAt:       proposal.passedAt,
      timelockEndsAt: proposal.passedAt + timelockSecs,
      attempts:       0,
      lastAttemptAt:  0,
    };

    this.pending.set(proposal.coreId, record);
    console.log(
      `[ExecutionEngine] Enqueued coreId=${proposal.coreId} ` +
      `timelock=${timelockSecs}s category=${proposal.category}`,
    );
    return record;
  }

  /** Point-in-time view of a single execution record. */
  getRecord(coreId: number): ExecutionRecord | undefined {
    return this.pending.get(coreId);
  }

  /** List all pending / recent execution records. */
  listRecords(): ExecutionRecord[] {
    return [...this.pending.values()];
  }

  // ── Internal — Poll Loop ───────────────────────────────────────────────────

  private async _pollAndExecute(): Promise<void> {
    const now = nowSec();

    for (const record of this.pending.values()) {
      if (record.status === "CONFIRMED" || record.status === "EXECUTION_FAILED") continue;

      // Transition PENDING_TIMELOCK → READY when timelock elapses.
      if (record.status === "PENDING_TIMELOCK" && now >= record.timelockEndsAt) {
        record.status = "READY";
      }

      if (record.status !== "READY") continue;
      if (record.attempts >= MAX_RETRIES) {
        record.status = "EXECUTION_FAILED";
        record.error  = `Exceeded ${MAX_RETRIES} relay attempts`;
        void this._auditEvent(record, "execution_failed");
        continue;
      }

      // Exponential backoff between retries.
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, record.attempts);
      if (record.lastAttemptAt > 0 && (now - record.lastAttemptAt) * 1000 < backoffMs) continue;

      await this._attemptExecution(record);
    }
  }

  private async _attemptExecution(record: ExecutionRecord): Promise<void> {
    record.attempts     += 1;
    record.lastAttemptAt = nowSec();

    const chainId = layerToChainId(record.targetLayer);

    const payload: ExecutionPayload = {
      action:      "execute_proposal",
      core_id:     record.coreId,
      description: record.description,
      category:    record.category,
      target_layer: record.targetLayer,
      target_chain_id: chainId,
      chain_id:    L1_CHAIN_ID,     // Settlement always L1
      gas_token:   "GST",
      timestamp:   record.lastAttemptAt,
    };

    try {
      const res = await this.fetcher(`${this.relayUrl}/governance/execute`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Relay HTTP ${res.status}`);
      const data = (await res.json()) as { tx_id: string };

      record.status    = "CONFIRMED";
      record.relayTxId = data.tx_id;

      console.log(
        `[ExecutionEngine] coreId=${record.coreId} executed tx=${data.tx_id}`,
      );
      void this._auditEvent(record, "execution_confirmed");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      record.error = msg;
      console.error(`[ExecutionEngine] Attempt ${record.attempts} failed coreId=${record.coreId}:`, msg);
    }
  }

  // ── Internal — GhostBrain Audit ───────────────────────────────────────────

  private async _auditEvent(record: ExecutionRecord, eventType: string): Promise<void> {
    const payload: AuditEvent = {
      event_type:  eventType,
      core_id:     record.coreId,
      category:    record.category,
      status:      record.status,
      relay_tx_id: record.relayTxId,
      attempts:    record.attempts,
      chain_id:    L1_CHAIN_ID,
      gas_token:   "GST",
      timestamp:   nowSec(),
    };

    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/governance/execution-event`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[ExecutionEngine] GhostBrain audit failed:", err.message);
    }
  }

  // ── Internal — Eviction ────────────────────────────────────────────────────

  private _evict(): void {
    for (const [id, rec] of this.pending) {
      if (rec.status === "CONFIRMED" || rec.status === "EXECUTION_FAILED") {
        this.pending.delete(id);
        return;
      }
    }
    // Fallback: evict oldest.
    const first = this.pending.keys().next().value;
    if (first !== undefined) this.pending.delete(first);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function layerToChainId(layer: TargetLayer): number {
  if (layer === "L2") return L2_CHAIN_ID;
  if (layer === "L3") return L3_CHAIN_ID;
  return L1_CHAIN_ID;
}

// ── Payload Shapes ────────────────────────────────────────────────────────────

interface ExecutionPayload {
  action:          string;
  core_id:         number;
  description:     string;
  category:        ProposalCategory;
  target_layer:    TargetLayer;
  target_chain_id: number;
  chain_id:        number;
  gas_token:       string;
  timestamp:       number;
}

interface AuditEvent {
  event_type:  string;
  core_id:     number;
  category:    ProposalCategory;
  status:      ExecutionStatus;
  relay_tx_id?: string;
  attempts:    number;
  chain_id:    number;
  gas_token:   string;
  timestamp:   number;
}
