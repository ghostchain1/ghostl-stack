/**
 * GhostChain Sovereign Interchain Bridge — Bridge Monitor
 *
 * Tracks bridge health across all layers and raises alerts when the
 * bridge enters a degraded or halted state.
 *
 * Health metrics tracked:
 *   - Queue depth (pending messages waiting for validator quorum)
 *   - Age of oldest pending message (staleness indicator)
 *   - Approval rate (approvals per minute, rolling)
 *   - Validator responsiveness (last-seen per validator)
 *   - Balance drift (AssetLocker balance vs. expected total locked)
 *   - Error rate (failed relay or finalisation attempts)
 *
 * Circuit breaker:
 *   When `stalePendingAgeSec` > `STALE_THRESHOLD` and `queueDepth` > `QUEUE_WARN`
 *   the monitor emits a circuit-breaker advisory to GhostBrain, which can
 *   trigger a governance proposal to pause the bridge.
 *
 * SECURITY:
 *   - Health records are bounded (MAX_RECORDS).
 *   - All amounts are bigint.
 *   - No autonomous bridge pausing — advisory signals only.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const L1_CHAIN_ID = 14000101;
const MAX_RECORDS = 500;
const STALE_THRESHOLD_SEC = 600;   // 10 minutes
const QUEUE_WARN          = 100;
const APPROVAL_RATE_MIN   = 1;     // approvals/min floor before alert

// ── Types ────────────────────────────────────────────────────────────────────

export type BridgeHealthStatus = "healthy" | "degraded" | "halted";

export interface ValidatorHeartbeat {
  address:  string;
  lastSeen: number;   // Unix seconds
}

export interface BridgeHealthSnapshot {
  timestamp:           number;
  status:              BridgeHealthStatus;
  queueDepth:          number;
  stalePendingAgeSec:  number;
  approvalRatePerMin:  number;
  errorRatePct:        number;
  lockerBalanceGst:    bigint;
  expectedLockedGst:   bigint;
  balanceDriftGst:     bigint;
  validatorCount:      number;
  unresponsiveCount:   number;
  alertMessages:       string[];
}

// ── BridgeMonitor ─────────────────────────────────────────────────────────────

export interface BridgeMonitorOptions {
  ghostbrainUrl?: string;
  relayUrl?:      string;
  /** Validator inactivity threshold in seconds before marking unresponsive. */
  validatorTimeoutSec?: number;
}

export class BridgeMonitor {
  private readonly ghostbrainUrl:       string;
  private readonly relayUrl:            string;
  private readonly validatorTimeoutSec: number;

  private queueDepth:        number = 0;
  private oldestPendingAt:   number = 0;   // Unix seconds (0 = no pending)
  private lockerBalanceGst:  bigint = 0n;
  private expectedLockedGst: bigint = 0n;

  /** Rolling approval events (timestamps). */
  private readonly approvalTimes: number[] = [];
  /** Rolling error events (timestamps). */
  private readonly errorTimes:    number[] = [];
  /** Total events seen (for error rate denominator). */
  private totalEvents: number = 0;

  /** Validator heartbeats keyed by address. */
  private readonly validators = new Map<string, ValidatorHeartbeat>();

  /** Historical snapshots. */
  private readonly snapshots: BridgeHealthSnapshot[] = [];

  constructor(opts: BridgeMonitorOptions = {}) {
    this.ghostbrainUrl       = opts.ghostbrainUrl       ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.relayUrl            = opts.relayUrl            ?? (process.env["SIGNING_RELAY_URL"]   ?? "http://localhost:7910");
    this.validatorTimeoutSec = opts.validatorTimeoutSec ?? 120;
  }

  // ── Feed methods (called by relayer / validator / chain watcher) ────────────

  setQueueDepth(depth: number, oldestPendingAt: number): void {
    this.queueDepth      = depth;
    this.oldestPendingAt = depth > 0 ? oldestPendingAt : 0;
  }

  recordApproval(nowSec: number = Math.floor(Date.now() / 1000)): void {
    this.approvalTimes.push(nowSec);
    this.totalEvents++;
    this.pruneWindow(this.approvalTimes, nowSec, 60);
  }

  recordError(nowSec: number = Math.floor(Date.now() / 1000)): void {
    this.errorTimes.push(nowSec);
    this.totalEvents++;
    this.pruneWindow(this.errorTimes, nowSec, 300);
  }

  updateLockerBalance(balanceGst: bigint, expectedGst: bigint): void {
    this.lockerBalanceGst  = balanceGst;
    this.expectedLockedGst = expectedGst;
  }

  heartbeat(validatorAddress: string, nowSec: number = Math.floor(Date.now() / 1000)): void {
    this.validators.set(validatorAddress, { address: validatorAddress, lastSeen: nowSec });
  }

  // ── Core tick ──────────────────────────────────────────────────────────────

  async check(nowSec: number = Math.floor(Date.now() / 1000)): Promise<BridgeHealthSnapshot> {
    const snap = this.compute(nowSec);
    this.snapshots.push(snap);
    if (this.snapshots.length > MAX_RECORDS) this.snapshots.shift();

    this.forward(snap).catch((err: Error) =>
      console.error("[BridgeMonitor] GhostBrain forward error:", err.message),
    );

    if (snap.status !== "healthy") {
      this.forwardCircuitBreaker(snap).catch((err: Error) =>
        console.error("[BridgeMonitor] circuit-breaker alert error:", err.message),
      );
    }

    return snap;
  }

  latestSnapshot(): BridgeHealthSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private compute(nowSec: number): BridgeHealthSnapshot {
    this.pruneWindow(this.approvalTimes, nowSec, 60);
    this.pruneWindow(this.errorTimes,    nowSec, 300);

    const stalePendingAgeSec = this.oldestPendingAt > 0
      ? nowSec - this.oldestPendingAt
      : 0;

    const approvalRatePerMin = this.approvalTimes.length; // events in last 60s
    const errorRatePct       = this.totalEvents > 0
      ? (this.errorTimes.length / this.totalEvents) * 100
      : 0;

    const balanceDriftGst = this.lockerBalanceGst - this.expectedLockedGst;

    const unresponsiveCount = [...this.validators.values()]
      .filter(v => nowSec - v.lastSeen > this.validatorTimeoutSec)
      .length;

    const alertMessages: string[] = [];

    if (stalePendingAgeSec > STALE_THRESHOLD_SEC && this.queueDepth > 0)
      alertMessages.push(`stale messages: oldest ${stalePendingAgeSec}s pending (depth=${this.queueDepth})`);
    if (this.queueDepth > QUEUE_WARN)
      alertMessages.push(`queue depth high: ${this.queueDepth}`);
    if (approvalRatePerMin < APPROVAL_RATE_MIN && this.queueDepth > 0)
      alertMessages.push(`low approval rate: ${approvalRatePerMin}/min with ${this.queueDepth} pending`);
    if (errorRatePct > 10)
      alertMessages.push(`high error rate: ${errorRatePct.toFixed(1)}%`);
    if (balanceDriftGst < 0n)
      alertMessages.push(`locker balance deficit: ${balanceDriftGst.toString()} GST`);
    if (unresponsiveCount > 0)
      alertMessages.push(`${unresponsiveCount} validator(s) unresponsive`);

    const status = this.deriveStatus(alertMessages, stalePendingAgeSec);

    return {
      timestamp:           nowSec,
      status,
      queueDepth:          this.queueDepth,
      stalePendingAgeSec,
      approvalRatePerMin,
      errorRatePct,
      lockerBalanceGst:    this.lockerBalanceGst,
      expectedLockedGst:   this.expectedLockedGst,
      balanceDriftGst,
      validatorCount:      this.validators.size,
      unresponsiveCount,
      alertMessages,
    };
  }

  private deriveStatus(alerts: string[], staleAgeSec: number): BridgeHealthStatus {
    if (staleAgeSec > STALE_THRESHOLD_SEC * 3) return "halted";
    if (alerts.length > 0)                      return "degraded";
    return "healthy";
  }

  private pruneWindow(buf: number[], nowSec: number, windowSec: number): void {
    const cutoff = nowSec - windowSec;
    while (buf.length > 0 && (buf[0] ?? 0) < cutoff) buf.shift();
  }

  private async forward(snap: BridgeHealthSnapshot): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/bridge/health`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        chain_id:          L1_CHAIN_ID,
        gas_token:         "GST",
        ...snap,
        lockerBalanceGst:  snap.lockerBalanceGst.toString(),
        expectedLockedGst: snap.expectedLockedGst.toString(),
        balanceDriftGst:   snap.balanceDriftGst.toString(),
      }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }

  private async forwardCircuitBreaker(snap: BridgeHealthSnapshot): Promise<void> {
    const resp = await fetch(`${this.relayUrl}/relay/bridge/circuit-breaker`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        chain_id:   L1_CHAIN_ID,
        gas_token:  "GST",
        from:       "ghostbrain-interchain-bridge",
        status:     snap.status,
        alerts:     snap.alertMessages,
        timestamp:  snap.timestamp,
      }),
    });
    if (!resp.ok) throw new Error(`relay responded ${resp.status}`);
  }
}
