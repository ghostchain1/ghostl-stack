/**
 * GhostBrain Autonomous Operations Engine — Config Rules
 *
 * All thresholds and URLs are env-configurable.  Hard defaults are
 * conservative: the engine raises proposals before conditions become
 * critical so operators have lead-time for ratification.
 *
 * GOVERNANCE MODEL
 * ─────────────────
 *   This service is DETECT-AND-PROPOSE only.
 *   It never issues write commands.  Every detected anomaly is forwarded
 *   as a structured proposal to the signing relay (SIGNING_RELAY_URL)
 *   where a human operator must Approve before any action is taken.
 *
 *   DRY_RUN=1 logs proposals locally without sending them anywhere.
 */

// ── Strategy targets (Phase 51) ────────────────────────────────────────────

export const STRATEGY = {
  /** CPU % target for each validator — proposals fired when sustained above. */
  validatorTargetLoad:   Number(process.env.VALIDATOR_TARGET_LOAD   ?? "70"),
  /** Annualised treasury yield rate target (informational, not enforced). */
  treasuryYieldTarget:   Number(process.env.TREASURY_YIELD_TARGET   ?? "12"),
  /** Minimum number of redundant validator nodes per chain. */
  nodeRedundancy:        Number(process.env.NODE_REDUNDANCY         ?? "3"),
} as const;

// ── Detection thresholds (Phase 52) ────────────────────────────────────────

export const RULES = {
  // Validator anomaly triggers
  validatorCpuCritical:   Number(process.env.VALIDATOR_CPU_CRITICAL  ?? "90"),
  validatorCpuWarn:       Number(process.env.VALIDATOR_CPU_WARN      ?? "80"),
  validatorUptimeCritical:Number(process.env.VALIDATOR_UPTIME_CRIT   ?? "0.80"),
  validatorUptimeWarn:    Number(process.env.VALIDATOR_UPTIME_WARN   ?? "0.90"),

  // Chain staleness: block head older than this → alert
  chainBlockStaleMs:      Number(process.env.CHAIN_BLOCK_STALE_MS   ?? "120000"),

  // Infrastructure: any non-running container fires a proposal
  containerDownAlert:     process.env.CONTAINER_DOWN_ALERT !== "0",

  // Liquidity imbalance: TVL spread ratio (max/min) above this → alert
  liquidityImbalanceRatio:Number(process.env.LIQUIDITY_IMBALANCE    ?? "5"),
} as const;

// ── Operational config ──────────────────────────────────────────────────────

export const CONFIG = {
  /** Internal API base — the web BFF that exposes chain/validator data. */
  apiBase:          process.env.GHOSTSTACK_API_BASE  ?? "http://localhost:3000",

  /** GhostBrain Core base URL. */
  ghostbrainUrl:    process.env.GHOSTBRAIN_URL        ?? "http://localhost:7900",

  /** Signing relay — where proposals are delivered for human ratification. */
  signingRelayUrl:  process.env.SIGNING_RELAY_URL     ?? "http://localhost:7910",

  /** Main detection loop interval in ms. */
  pollIntervalMs:   Number(process.env.POLL_INTERVAL_MS ?? "30000"),

  /** Health API port for this service. */
  healthPort:       Number(process.env.GHOSTAUTO_PORT ?? "7921"),

  /**
   * DRY_RUN mode — proposals are assembled and logged but NOT sent to the
   * signing relay.  Use in staging/testing.
   */
  dryRun:           process.env.DRY_RUN === "1",
} as const;
