/**
 * Infrastructure Agent
 *
 * Monitors platform system health:
 *  - Streaming server load and WebRTC node availability
 *  - Microtransaction engine throughput
 *  - GhostL3 settlement queue depth
 *  - End-to-end latency sentinel
 *
 * When issues are detected, proposals for scaling are emitted as governance
 * suggestions, never executed autonomously.
 */

import { BaseAgent, Decision, PlatformMetrics } from '../governor_core.js';

const BACKEND_URL   = process.env.BACKEND_URL   ?? 'http://localhost:7001';
const MEDIASOUP_URL = process.env.MEDIASOUP_URL ?? 'http://localhost:2000';

// Thresholds
const HIGH_STREAMS_PER_NODE    = 50;     // streams per MediaSoup worker
const SETTLEMENT_QUEUE_WARNING = 30;
const SETTLEMENT_QUEUE_CRITICAL = 75;
const HEALTH_CHECK_TIMEOUT_MS  = 5_000;

interface InfraStatus {
  backendOk:      boolean;
  mediasoupOk:    boolean;
  settlementOk:   boolean;
  backendLatency: number;   // ms
}

export class InfrastructureAgent extends BaseAgent {
  readonly name = 'infrastructure' as const;

  private lastStatus: InfraStatus = {
    backendOk: true, mediasoupOk: true, settlementOk: true, backendLatency: 0,
  };

  async execute(metrics: PlatformMetrics): Promise<Decision[]> {
    const decisions: Decision[] = [];

    // ── Health probes ─────────────────────────────────────────────────────
    const [backendStatus, mediasoupStatus] = await Promise.all([
      this._probeBackend(),
      this._probeMediasoup(),
    ]);

    this.lastStatus = { ...backendStatus, ...mediasoupStatus, settlementOk: true };

    // Backend down
    if (!backendStatus.backendOk) {
      decisions.push({
        agent:     'infrastructure',
        action:    'ALERT_BACKEND_DOWN',
        reason:    `Backend health check failed (latency: ${backendStatus.backendLatency}ms) — watchdog notified`,
        severity:  'critical',
        timestamp: Date.now(),
      });
    } else if (backendStatus.backendLatency > 2_000) {
      decisions.push({
        agent:     'infrastructure',
        action:    'ALERT_BACKEND_SLOW',
        reason:    `Backend latency ${backendStatus.backendLatency}ms exceeds 2s threshold`,
        severity:  'warning',
        timestamp: Date.now(),
      });
    }

    // MediaSoup/WebRTC down
    if (!mediasoupStatus.mediasoupOk) {
      decisions.push({
        agent:     'infrastructure',
        action:    'ALERT_SFU_DOWN',
        reason:    'MediaSoup SFU health check failed — streaming may be degraded',
        severity:  'critical',
        timestamp: Date.now(),
      });
    }

    // ── Settlement queue ──────────────────────────────────────────────────
    if (metrics.settlementQueueDepth >= SETTLEMENT_QUEUE_CRITICAL) {
      decisions.push({
        agent:     'infrastructure',
        action:    'EMERGENCY_SETTLEMENT_FLUSH',
        reason:    `Settlement queue at ${metrics.settlementQueueDepth} — critical depth, requesting emergency batch on GhostL3`,
        severity:  'critical',
        timestamp: Date.now(),
      });
    } else if (metrics.settlementQueueDepth >= SETTLEMENT_QUEUE_WARNING) {
      decisions.push({
        agent:     'infrastructure',
        action:    'FLUSH_SETTLEMENT_QUEUE',
        reason:    `Settlement queue at ${metrics.settlementQueueDepth} — recommending GhostL3 batch settlement`,
        severity:  'warning',
        timestamp: Date.now(),
      });
    }

    // ── Stream load vs. node capacity ────────────────────────────────────
    if (metrics.liveStreams > HIGH_STREAMS_PER_NODE) {
      decisions.push({
        agent:     'infrastructure',
        action:    'SCALE_STREAMING_NODES',
        reason:    `${metrics.liveStreams} live streams exceed per-node limit of ${HIGH_STREAMS_PER_NODE} — proposing new SFU node`,
        severity:  'warning',
        timestamp: Date.now(),
      });
    }

    return decisions;
  }

  private async _probeBackend(): Promise<Pick<InfraStatus, 'backendOk' | 'backendLatency'>> {
    const t0 = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HEALTH_CHECK_TIMEOUT_MS);
      const res = await fetch(`${BACKEND_URL}/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      return { backendOk: res.ok, backendLatency: Date.now() - t0 };
    } catch {
      return { backendOk: false, backendLatency: Date.now() - t0 };
    }
  }

  private async _probeMediasoup(): Promise<Pick<InfraStatus, 'mediasoupOk'>> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HEALTH_CHECK_TIMEOUT_MS);
      const res = await fetch(`${MEDIASOUP_URL}/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      return { mediasoupOk: res.ok };
    } catch {
      return { mediasoupOk: false };
    }
  }

  get currentStatus(): InfraStatus { return this.lastStatus; }
}
