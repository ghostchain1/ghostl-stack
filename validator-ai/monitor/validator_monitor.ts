/**
 * GhostChain AI Validator Network — Validator Monitor
 *
 * Tracks health of all registered validators across GhostChain L1,
 * GhostL2, and GhostL3. Aggregates per-validator status, uptime, and
 * missed-block counts.  Forwards degraded-validator alerts to GhostBrain
 * Core for global network analysis.
 *
 * Chain routing law:
 *   Data flows: L1 (14000101) · L2 (901) · L3 (903)
 *   Alerts out: POST to GhostBrain Core at :7900 (never external chains)
 *   Gas token: GST
 *
 * SECURITY:
 *   - No private keys held here; read-only RPC calls only.
 *   - Alert payloads contain no key material.
 */

// ── Chain constants ────────────────────────────────────────────────────────

export const CHAIN_IDS = {
  L1: 14000101,
  L2: 901,
  L3: 903,
} as const;

export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

export type ValidatorStatus = "online" | "degraded" | "offline" | "jailed";

// Per-chain RPC endpoints (resolved from environment at construction time).
export interface ChainEndpoints {
  l1Rpc: string;
  l2Rpc: string;
  l3Rpc: string;
}

// ── Domain types ───────────────────────────────────────────────────────────

export interface ValidatorRecord {
  /** Bech32 or hex operator address (GhostChain). */
  address:      string;
  /** Human-readable moniker. */
  moniker:      string;
  /** Chain this validator is active on. */
  chainId:      ChainId;
  status:       ValidatorStatus;
  /** Current voting power (GST in smallest unit as bigint). */
  votingPower:  bigint;
  /** Cumulative missed blocks in the current slashing window. */
  missedBlocks: number;
  /** Unix epoch of last successful ping from this validator. */
  lastSeenAt:   number;
  /** Free-form metadata: version, region, etc. */
  meta:         Record<string, string>;
}

export interface MonitorAlert {
  timestamp:   number;
  validatorId: string;
  chainId:     ChainId;
  severity:    "info" | "warning" | "critical";
  reason:      string;
  status:      ValidatorStatus;
}

// ── ValidatorMonitor ───────────────────────────────────────────────────────

export interface ValidatorMonitorOptions {
  ghostbrainUrl?: string;
  /** Missed-block threshold before raising a warning. */
  missedBlockWarning?: number;
  /** Missed-block threshold before raising a critical alert. */
  missedBlockCritical?: number;
  /** Seconds since lastSeenAt before a validator is considered offline. */
  offlineThresholdS?: number;
}

export class ValidatorMonitor {
  private readonly validators = new Map<string, ValidatorRecord>();
  private readonly ghostbrainUrl:       string;
  private readonly missedBlockWarning:  number;
  private readonly missedBlockCritical: number;
  private readonly offlineThresholdS:   number;

  constructor(opts: ValidatorMonitorOptions = {}) {
    this.ghostbrainUrl       = opts.ghostbrainUrl       ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.missedBlockWarning  = opts.missedBlockWarning  ?? 50;
    this.missedBlockCritical = opts.missedBlockCritical ?? 200;
    this.offlineThresholdS   = opts.offlineThresholdS   ?? 120;
  }

  // ── Registration ─────────────────────────────────────────────────────────

  register(v: ValidatorRecord): void {
    this.validators.set(v.address, v);
  }

  update(address: string, patch: Partial<ValidatorRecord>): void {
    const existing = this.validators.get(address);
    if (!existing) throw new Error(`ValidatorMonitor: unknown validator ${address}`);
    this.validators.set(address, { ...existing, ...patch });
  }

  get(address: string): ValidatorRecord | undefined {
    return this.validators.get(address);
  }

  all(): ValidatorRecord[] {
    return [...this.validators.values()];
  }

  // ── Health evaluation ─────────────────────────────────────────────────────

  /**
   * Runs one monitoring cycle.  Evaluates every registered validator,
   * emits alerts for degraded nodes, and forwards them to GhostBrain.
   *
   * Returns the list of alerts generated this cycle.
   */
  async check(): Promise<MonitorAlert[]> {
    const now    = Math.floor(Date.now() / 1000);
    const alerts: MonitorAlert[] = [];

    for (const v of this.validators.values()) {
      const derived = this.deriveStatus(v, now);
      // Update status in place.
      if (derived.status !== v.status) {
        this.validators.set(v.address, { ...v, status: derived.status });
      }
      if (derived.alert) {
        alerts.push(derived.alert);
      }
    }

    // Forward all alerts to GhostBrain asynchronously — don't block the cycle.
    if (alerts.length > 0) {
      this.forwardAlerts(alerts).catch((err: Error) =>
        console.error("[ValidatorMonitor] GhostBrain forward error:", err.message),
      );
    }

    return alerts;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private deriveStatus(
    v:   ValidatorRecord,
    now: number,
  ): { status: ValidatorStatus; alert: MonitorAlert | null } {
    // Jailed state takes priority — requires on-chain unjail; don't override.
    if (v.status === "jailed") {
      return {
        status: "jailed",
        alert: {
          timestamp:   now,
          validatorId: v.address,
          chainId:     v.chainId,
          severity:    "critical",
          reason:      `Validator ${v.moniker} is jailed`,
          status:      "jailed",
        },
      };
    }

    const staleSecs = now - v.lastSeenAt;

    if (staleSecs >= this.offlineThresholdS) {
      return {
        status: "offline",
        alert: {
          timestamp:   now,
          validatorId: v.address,
          chainId:     v.chainId,
          severity:    "critical",
          reason:      `Validator ${v.moniker} offline (no ping for ${staleSecs}s)`,
          status:      "offline",
        },
      };
    }

    if (v.missedBlocks >= this.missedBlockCritical) {
      return {
        status: "degraded",
        alert: {
          timestamp:   now,
          validatorId: v.address,
          chainId:     v.chainId,
          severity:    "critical",
          reason:      `Validator ${v.moniker} missed ${v.missedBlocks} blocks (critical threshold)`,
          status:      "degraded",
        },
      };
    }

    if (v.missedBlocks >= this.missedBlockWarning) {
      return {
        status: "degraded",
        alert: {
          timestamp:   now,
          validatorId: v.address,
          chainId:     v.chainId,
          severity:    "warning",
          reason:      `Validator ${v.moniker} missed ${v.missedBlocks} blocks`,
          status:      "degraded",
        },
      };
    }

    return { status: "online", alert: null };
  }

  /** POST alerts to GhostBrain Core :7900/validator/alerts */
  private async forwardAlerts(alerts: MonitorAlert[]): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/validator/alerts`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chain_id: CHAIN_IDS.L1, gas_token: "GST", alerts }),
    });

    if (!resp.ok) {
      throw new Error(`GhostBrain responded ${resp.status}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  summary(): Record<ValidatorStatus, number> {
    const counts: Record<ValidatorStatus, number> = {
      online: 0, degraded: 0, offline: 0, jailed: 0,
    };
    for (const v of this.validators.values()) {
      counts[v.status]++;
    }
    return counts;
  }
}
