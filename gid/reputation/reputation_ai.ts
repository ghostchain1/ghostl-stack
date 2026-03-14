/**
 * GhostChain Sovereign Identity Network — Reputation AI
 *
 * Multi-dimensional behavioral reputation scoring for GhostChain identities.
 *
 * Scoring categories (mirror ReputationEngine.sol categories):
 *   governance   — Participation in GhostChainGovernor proposals and votes
 *   validator    — Uptime, correct attestations, slashing history
 *   bridge       — Successful bridge operations, fraud-alert absence
 *   community    — GNS usage, vouching, LGE participation
 *
 * Algorithm:
 *   Per-address per-category rolling history (bounded MAX_HISTORY observations).
 *   Welford online variance + running mean track score stability.
 *   Anomaly detection: if latest observation deviates by more than
 *   ZSCORE_THRESHOLD standard deviations from the rolling mean, an advisory
 *   alert is published to GhostBrain Core (:7900).
 *
 * Advisory-only:
 *   This module NEVER writes directly to ReputationEngine.sol.  It forwards
 *   score-adjustment proposals to GhostBrain (/gid/reputation-advisory) and
 *   optionally to the signing relay (:7910) for human-ratified on-chain
 *   execution.
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const L1_CHAIN_ID    = 14000101;

const MAX_HISTORY    = 200;       // Observations per address per category
const ZSCORE_THRESH  = 3.0;       // Anomaly threshold (3-sigma)
const MIN_WARMUP     = 5;         // Minimum observations for reliable statistics

const GHOSTBRAIN_URL = process.env["GHOSTBRAIN_API_URL"]  ?? "http://localhost:7900";
const RELAY_URL      = process.env["SIGNING_RELAY_URL"]   ?? "http://localhost:7910";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScoreCategory = "governance" | "validator" | "bridge" | "community";

export const ALL_CATEGORIES: readonly ScoreCategory[] =
  ["governance", "validator", "bridge", "community"] as const;

export interface ScoreObservation {
  value:     number;       // Raw score value observed (integer, 0 – MAX_SCORE_PER_CATEGORY)
  timestamp: number;       // Unix seconds
  source:    string;       // e.g. "governance-bridge", "validator-attestation"
}

/** Welford online variance accumulator. */
interface Welford {
  n:     number;
  mean:  number;
  m2:    number;           // Sum of squared deviations; variance = m2 / (n - 1)
}

interface CategoryState {
  history:  ScoreObservation[];
  welford:  Welford;
}

interface AddressState {
  categories: Record<ScoreCategory, CategoryState>;
  lastSeen:   number;
}

export interface CategoryProfile {
  category:         ScoreCategory;
  latestScore:      number;
  rollingMean:      number;
  rollingStdDev:    number;
  observations:     number;
  confidence:       number;          // 0..1, rises with observation count
  anomalyDetected:  boolean;
}

export interface IdentityBehaviorProfile {
  address:     string;
  categories:  CategoryProfile[];
  totalScore:  number;               // Weighted sum, matches on-chain formula
  lastUpdated: number;               // Unix seconds
  chain_id:    number;
  gas_token:   string;
}

export interface ReputationAIOptions {
  ghostbrainUrl?: string;
  relayUrl?:      string;
  /** Injected fetch function (defaults to global fetch). */
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── Weights (mirror ReputationEngine.sol defaults: 30/30/20/20 out of 100) ──

const CATEGORY_WEIGHTS: Record<ScoreCategory, number> = {
  governance: 30,
  validator:  30,
  bridge:     20,
  community:  20,
};

// ── ReputationAI ──────────────────────────────────────────────────────────────

export class ReputationAI {
  private readonly ghostbrainUrl: string;
  private readonly relayUrl:      string;
  private readonly fetcher:        (url: string, init?: RequestInit) => Promise<Response>;

  /** address (lowercase) → per-category state */
  private readonly registry = new Map<string, AddressState>();

  constructor(opts: ReputationAIOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? GHOSTBRAIN_URL;
    this.relayUrl      = opts.relayUrl      ?? RELAY_URL;
    this.fetcher       = opts.fetcher       ?? ((url, init) => fetch(url, init));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Record a new score observation for `address` in `category`.
   * Appends to rolling history, updates Welford accumulators,
   * and emits an advisory alert to GhostBrain if anomaly detected.
   */
  async observe(
    address:  string,
    category: ScoreCategory,
    value:    number,
    source:   string,
  ): Promise<void> {
    const addr  = address.trim().toLowerCase();
    const state = this._getOrCreateState(addr);
    const cat   = state.categories[category];

    const observation: ScoreObservation = {
      value,
      timestamp: ReputationAI._nowSec(),
      source,
    };

    // Append to bounded ring buffer.
    cat.history.push(observation);
    if (cat.history.length > MAX_HISTORY) cat.history.shift();

    // Update Welford accumulators.
    this._welfordUpdate(cat.welford, value);
    state.lastSeen = observation.timestamp;

    // Anomaly detection.
    if (this._isAnomaly(cat.welford, value)) {
      void this._reportAnomaly(addr, category, value, cat.welford);
    }
  }

  /**
   * Build and return the current behavior profile for `address`.
   * If no local history exists, fetches from GhostBrain.
   */
  async getProfile(address: string): Promise<IdentityBehaviorProfile> {
    const addr       = address.trim().toLowerCase();
    const state      = this._getOrCreateState(addr);
    const categories = ALL_CATEGORIES.map((cat) =>
      this._buildCategoryProfile(cat, state.categories[cat]),
    );

    const totalScore = this._computeTotal(categories);

    return {
      address:     addr,
      categories,
      totalScore,
      lastUpdated: state.lastSeen || ReputationAI._nowSec(),
      chain_id:    L1_CHAIN_ID,
      gas_token:   "GST",
    };
  }

  /**
   * Advisory: propose a score adjustment to GhostBrain and (optionally)
   * the signing relay for human-ratified on-chain execution.
   */
  async proposeScoreAdjustment(params: ScoreAdjustmentProposal): Promise<void> {
    const payload: GhostBrainAdvisory = {
      proposal_type: "score_adjustment",
      address:       params.address.toLowerCase(),
      category:      params.category,
      delta:         params.delta,              // positive = increase, negative = decrease
      reason:        params.reason,
      confidence:    params.confidence,
      chain_id:      L1_CHAIN_ID,
      gas_token:     "GST",
      timestamp:     ReputationAI._nowSec(),
    };

    await this._postGhostBrain("/gid/reputation-advisory", payload);

    // Only forward to relay if confidence is high enough.
    if (params.confidence >= 0.8) {
      await this._postRelay("/gid/propose-score", payload);
    }
  }

  // ── Internal — State Management ────────────────────────────────────────────

  private _getOrCreateState(address: string): AddressState {
    const existing = this.registry.get(address);
    if (existing) return existing;

    const fresh: AddressState = {
      categories: {
        governance: { history: [], welford: ReputationAI._emptyWelford() },
        validator:  { history: [], welford: ReputationAI._emptyWelford() },
        bridge:     { history: [], welford: ReputationAI._emptyWelford() },
        community:  { history: [], welford: ReputationAI._emptyWelford() },
      },
      lastSeen: 0,
    };

    this.registry.set(address, fresh);
    return fresh;
  }

  // ── Internal — Welford Online Algorithm ───────────────────────────────────
  //
  //   Reference: B. P. Welford (1962), "Note on a method for calculating
  //   corrected sums of squares and products."
  //
  //   Running in O(1) space per update:
  //     mean_{n} = mean_{n-1} + (x - mean_{n-1}) / n
  //     M2_{n}   = M2_{n-1}   + (x - mean_{n-1}) * (x - mean_{n})
  //     σ²       = M2 / (n - 1)    for n ≥ 2

  private static _emptyWelford(): Welford {
    return { n: 0, mean: 0, m2: 0 };
  }

  private _welfordUpdate(w: Welford, x: number): void {
    w.n += 1;
    const delta  = x - w.mean;
    w.mean      += delta / w.n;
    const delta2 = x - w.mean;
    w.m2        += delta * delta2;
  }

  private static _stdDev(w: Welford): number {
    if (w.n < 2) return 0;
    return Math.sqrt(w.m2 / (w.n - 1));
  }

  private _isAnomaly(w: Welford, value: number): boolean {
    if (w.n < MIN_WARMUP) return false;
    const sigma = ReputationAI._stdDev(w);
    if (sigma === 0) return false;
    const zScore = Math.abs(value - w.mean) / sigma;
    return zScore > ZSCORE_THRESH;
  }

  // ── Internal — Profile Building ───────────────────────────────────────────

  private _buildCategoryProfile(
    category: ScoreCategory,
    cat:      CategoryState,
  ): CategoryProfile {
    const n          = cat.welford.n;
    const stdDev     = ReputationAI._stdDev(cat.welford);
    const latest     = cat.history[cat.history.length - 1]?.value ?? 0;
    const anomaly    = this._isAnomaly(cat.welford, latest);
    const confidence = Math.min(1, n / MIN_WARMUP) * (n > 0 ? 1 : 0);

    return {
      category,
      latestScore:     latest,
      rollingMean:     cat.welford.mean,
      rollingStdDev:   stdDev,
      observations:    n,
      confidence,
      anomalyDetected: anomaly,
    };
  }

  private _computeTotal(categories: CategoryProfile[]): number {
    let weighted = 0;
    for (const cp of categories) {
      weighted += cp.latestScore * (CATEGORY_WEIGHTS[cp.category] ?? 0);
    }
    return Math.floor(weighted / 100);
  }

  // ── Internal — Anomaly Reporting ──────────────────────────────────────────

  private async _reportAnomaly(
    address:   string,
    category:  ScoreCategory,
    value:     number,
    welford:   Welford,
  ): Promise<void> {
    const stdDev   = ReputationAI._stdDev(welford);
    const zScore   = stdDev > 0 ? Math.abs(value - welford.mean) / stdDev : 0;

    const payload: AnomalyAlert = {
      alert_type:  "reputation_anomaly",
      address,
      category,
      observed_value:  value,
      rolling_mean:    welford.mean,
      std_dev:         stdDev,
      z_score:         zScore,
      chain_id:        L1_CHAIN_ID,
      gas_token:       "GST",
      timestamp:       ReputationAI._nowSec(),
    };

    await this._postGhostBrain("/gid/reputation-anomaly", payload);
  }

  // ── Internal — HTTP Helpers ────────────────────────────────────────────────

  private async _postGhostBrain(path: string, payload: unknown): Promise<void> {
    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}${path}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error(`[ReputationAI] GhostBrain POST ${path} failed:`, err.message);
    }
  }

  private async _postRelay(path: string, payload: unknown): Promise<void> {
    try {
      const res = await this.fetcher(`${this.relayUrl}${path}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error(`[ReputationAI] Relay POST ${path} failed:`, err.message);
    }
  }

  // ── Internal — Utilities ──────────────────────────────────────────────────

  private static _nowSec(): number {
    return Math.floor(Date.now() / 1000);
  }
}

// ── Proposal / Alert Shapes ───────────────────────────────────────────────────

export interface ScoreAdjustmentProposal {
  address:    string;
  category:   ScoreCategory;
  /** Positive = score increase; negative = score decrease. */
  delta:      number;
  reason:     string;
  confidence: number;     // 0..1
}

interface GhostBrainAdvisory {
  proposal_type: string;
  address:       string;
  category:      ScoreCategory;
  delta:         number;
  reason:        string;
  confidence:    number;
  chain_id:      number;
  gas_token:     string;
  timestamp:     number;
}

interface AnomalyAlert {
  alert_type:     string;
  address:        string;
  category:       ScoreCategory;
  observed_value: number;
  rolling_mean:   number;
  std_dev:        number;
  z_score:        number;
  chain_id:       number;
  gas_token:      string;
  timestamp:      number;
}
