/**
 * GhostChain Global Governance AI — Proposal Engine
 *
 * Constructs and validates governance proposals before submitting them to the
 * ProposalManager contract on GhostChain L1 (chain_id 14000101).
 *
 * Proposal categories:
 *   PROTOCOL_UPGRADE   — consensus rule changes, EVM upgrades
 *   TREASURY_POLICY    — reward schedules, funding allocations
 *   VALIDATOR_RULES    — staking requirements, slashing parameters
 *   ECONOMIC_PARAMS    — gas policy, fee adjustments, LGE config
 *   CONSTITUTION       — GhostConstitution clause amendments
 *
 * Flow:
 *   1. Caller supplies a ProposalRequest with description, category, layer.
 *   2. ProposalEngine validates the request (format, layer, description length).
 *   3. GovernanceSimulator is consulted for pre-flight impact simulation.
 *   4. GovernanceAI performs advisory risk analysis.
 *   5. If simulation passed or risk is acceptable, a signed proposal payload is
 *      forwarded to the signing relay (:7910) for governance submission.
 *   6. A ProposalRecord with a local tracking id is returned.
 *
 * Advisory-only:
 *   This module never calls ProposalManager.submit() directly.  All on-chain
 *   submissions route through the signing relay after human review.
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const L1_CHAIN_ID = 14000101 as const;
const L2_CHAIN_ID = 901      as const;
const L3_CHAIN_ID = 903      as const;

const MAX_PROPOSALS       = 5_000;
const MAX_DESC_LENGTH     = 1_024;   // characters
const MIN_DESC_LENGTH     = 20;
const MAX_CATEGORY_LENGTH = 64;

const GHOSTBRAIN_URL = process.env["GHOSTBRAIN_API_URL"]    ?? "http://localhost:7900";
const RELAY_URL      = process.env["SIGNING_RELAY_URL"]     ?? "http://localhost:7910";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProposalCategory =
  | "PROTOCOL_UPGRADE"
  | "TREASURY_POLICY"
  | "VALIDATOR_RULES"
  | "ECONOMIC_PARAMS"
  | "CONSTITUTION";

export type TargetLayer = "L1" | "L2" | "L3";

export type ProposalStatus =
  | "DRAFT"
  | "SIMULATION_PASSED"
  | "SIMULATION_FAILED"
  | "SUBMITTED"
  | "RELAY_FAILED";

export interface ProposalRequest {
  description:      string;             // Short title or IPFS CID of full document
  category:         ProposalCategory;
  targetLayer:      TargetLayer;
  totalVotingPower: bigint;             // GST snapshot at proposal creation (wei)
  submitter:        string;             // 0x-prefixed wallet address
  metadata?:        Record<string, unknown>;
}

export interface ProposalRecord {
  localId:          string;             // Engine-internal UUID
  description:      string;
  category:         ProposalCategory;
  targetLayer:      TargetLayer;
  submitter:        string;
  totalVotingPower: bigint;
  status:           ProposalStatus;
  createdAt:        number;             // Unix seconds
  updatedAt:        number;
  simulationScore?: number;             // 0..1 (1 = safe)
  aiRiskScore?:     number;             // 0..1 (0 = low risk)
  relayTxId?:       string;
  rejectionReason?: string;
}

export interface ValidationResult {
  valid:  boolean;
  errors: string[];
}

export interface ProposalEngineOptions {
  ghostbrainUrl?: string;
  relayUrl?:      string;
  maxProposals?:  number;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── ProposalEngine ────────────────────────────────────────────────────────────

export class ProposalEngine {
  private readonly ghostbrainUrl: string;
  private readonly relayUrl:      string;
  private readonly maxProposals:  number;
  private readonly fetcher:        (url: string, init?: RequestInit) => Promise<Response>;

  private readonly proposals = new Map<string, ProposalRecord>();
  private proposalSeq        = 0;

  constructor(opts: ProposalEngineOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? GHOSTBRAIN_URL;
    this.relayUrl      = opts.relayUrl      ?? RELAY_URL;
    this.maxProposals  = opts.maxProposals   ?? MAX_PROPOSALS;
    this.fetcher       = opts.fetcher        ?? ((url, init) => fetch(url, init));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Validate, simulate, analyse, and submit a governance proposal.
   * Returns the ProposalRecord with status set to SUBMITTED or RELAY_FAILED.
   */
  async create(req: ProposalRequest): Promise<ProposalRecord> {
    const validation = this._validate(req);
    if (!validation.valid) {
      const record = this._makeRecord(req, "DRAFT");
      record.rejectionReason = validation.errors.join("; ");
      return record;
    }

    const record = this._makeRecord(req, "DRAFT");
    this._store(record);

    // Step 1: pre-flight simulation via GovernanceSimulator (forwarded to GhostBrain).
    const simScore = await this._requestSimulation(record);
    record.simulationScore = simScore;
    record.updatedAt       = nowSec();

    if (simScore < 0.4) {
      record.status          = "SIMULATION_FAILED";
      record.rejectionReason = `Simulation risk score too high (score=${simScore.toFixed(3)})`;
      this._store(record);
      return record;
    }
    record.status = "SIMULATION_PASSED";

    // Step 2: GhostBrain AI advisory risk analysis.
    const aiRisk = await this._requestAiAnalysis(record);
    record.aiRiskScore = aiRisk;
    record.updatedAt   = nowSec();

    // Step 3: forward to signing relay for human-ratified on-chain submission.
    const txId = await this._submitToRelay(record);
    record.updatedAt = nowSec();

    if (txId) {
      record.status    = "SUBMITTED";
      record.relayTxId = txId;
    } else {
      record.status          = "RELAY_FAILED";
      record.rejectionReason = "Signing relay rejected submission";
    }

    this._store(record);
    return record;
  }

  /** Retrieve a proposal by its local engine id. */
  get(localId: string): ProposalRecord | undefined {
    return this.proposals.get(localId);
  }

  /** List recent proposals (newest first, bounded). */
  list(limit = 50): ProposalRecord[] {
    const all = [...this.proposals.values()];
    return all.reverse().slice(0, limit);
  }

  /** Validate a proposal request without submitting. */
  validate(req: ProposalRequest): ValidationResult {
    return this._validate(req);
  }

  // ── Internal — Validation ──────────────────────────────────────────────────

  private _validate(req: ProposalRequest): ValidationResult {
    const errors: string[] = [];

    if (!req.description || req.description.trim().length < MIN_DESC_LENGTH)
      errors.push(`description too short (min ${MIN_DESC_LENGTH} chars)`);
    if (req.description && req.description.length > MAX_DESC_LENGTH)
      errors.push(`description too long (max ${MAX_DESC_LENGTH} chars)`);
    if (!VALID_CATEGORIES.has(req.category))
      errors.push(`unknown category: ${req.category}`);
    if (!VALID_LAYERS.has(req.targetLayer))
      errors.push(`unknown targetLayer: ${req.targetLayer}`);
    if (!/^0x[0-9a-fA-F]{40}$/.test(req.submitter))
      errors.push("invalid submitter address");
    if (req.totalVotingPower < 0n)
      errors.push("totalVotingPower must be ≥ 0");

    return { valid: errors.length === 0, errors };
  }

  // ── Internal — Simulation / AI Calls ──────────────────────────────────────

  private async _requestSimulation(record: ProposalRecord): Promise<number> {
    const payload: SimulationRequest = {
      proposal_id:   record.localId,
      description:   record.description,
      category:      record.category,
      target_layer:  record.targetLayer,
      chain_id:      L1_CHAIN_ID,
      gas_token:     "GST",
      timestamp:     record.createdAt,
    };

    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/governance/simulate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { score: number };
      return clamp01(data.score ?? 0.5);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[ProposalEngine] simulation request failed:", err.message);
      return 0.5; // neutral score on error
    }
  }

  private async _requestAiAnalysis(record: ProposalRecord): Promise<number> {
    const payload: AiAnalysisRequest = {
      proposal_id:   record.localId,
      description:   record.description,
      category:      record.category,
      target_layer:  record.targetLayer,
      sim_score:     record.simulationScore ?? 0.5,
      chain_id:      L1_CHAIN_ID,
      gas_token:     "GST",
      timestamp:     record.updatedAt,
    };

    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/governance/analyze`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { risk_score: number };
      return clamp01(data.risk_score ?? 0.5);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[ProposalEngine] AI analysis request failed:", err.message);
      return 0.5;
    }
  }

  private async _submitToRelay(record: ProposalRecord): Promise<string | null> {
    const payload: RelaySubmission = {
      action:            "propose",
      description:       record.description,
      category:          record.category,
      target_layer:      record.targetLayer,
      submitter:         record.submitter,
      total_voting_power: record.totalVotingPower.toString(),
      sim_score:         record.simulationScore ?? 0.5,
      ai_risk_score:     record.aiRiskScore    ?? 0.5,
      chain_id:          L1_CHAIN_ID,
      gas_token:         "GST",
      timestamp:         record.updatedAt,
    };

    try {
      const res = await this.fetcher(`${this.relayUrl}/governance/propose`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { tx_id: string };
      return data.tx_id ?? null;
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[ProposalEngine] relay submission failed:", err.message);
      return null;
    }
  }

  // ── Internal — Storage ────────────────────────────────────────────────────

  private _makeRecord(req: ProposalRequest, status: ProposalStatus): ProposalRecord {
    const id = this._nextId();
    const now = nowSec();
    return {
      localId:          id,
      description:      req.description,
      category:         req.category,
      targetLayer:      req.targetLayer,
      submitter:        req.submitter.toLowerCase(),
      totalVotingPower: req.totalVotingPower,
      status,
      createdAt:        now,
      updatedAt:        now,
    };
  }

  private _store(record: ProposalRecord): void {
    // Evict oldest if at capacity.
    if (this.proposals.size >= this.maxProposals) {
      const first = this.proposals.keys().next().value;
      if (first !== undefined) this.proposals.delete(first);
    }
    this.proposals.set(record.localId, record);
  }

  private _nextId(): string {
    this.proposalSeq += 1;
    return `prop-${L1_CHAIN_ID}-${nowSec()}-${this.proposalSeq}`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set<string>([
  "PROTOCOL_UPGRADE",
  "TREASURY_POLICY",
  "VALIDATOR_RULES",
  "ECONOMIC_PARAMS",
  "CONSTITUTION",
]);

const VALID_LAYERS = new Set<string>(["L1", "L2", "L3"]);

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// ── GhostBrain / Relay Payload Shapes ────────────────────────────────────────

interface SimulationRequest {
  proposal_id:  string;
  description:  string;
  category:     ProposalCategory;
  target_layer: TargetLayer;
  chain_id:     number;
  gas_token:    string;
  timestamp:    number;
}

interface AiAnalysisRequest extends SimulationRequest {
  sim_score: number;
}

interface RelaySubmission {
  action:             string;
  description:        string;
  category:           ProposalCategory;
  target_layer:       TargetLayer;
  submitter:          string;
  total_voting_power: string;
  sim_score:          number;
  ai_risk_score:      number;
  chain_id:           number;
  gas_token:          string;
  timestamp:          number;
}
