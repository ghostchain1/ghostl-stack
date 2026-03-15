/**
 * GhostBrain Autonomous Platform Governor
 *
 * Coordinates all AI agents in a continuous 30-second cycle.
 * All decisions are logged and exposed via REST for the admin dashboard.
 * Transactions are hard-enforced to GhostL3 (chain_id=903) / GST token only.
 */

import { EventEmitter } from 'node:events';

export const GHOST_L3_CHAIN_ID = 903;
export const CYCLE_INTERVAL_MS = 30_000;

// ── Types ──────────────────────────────────────────────────────────────────

export type AgentName =
  | 'economy'
  | 'security'
  | 'discovery'
  | 'event'
  | 'infrastructure'
  | 'treasury';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Decision {
  agent:     AgentName;
  action:    string;
  reason:    string;
  severity:  AlertSeverity;
  timestamp: number;
}

export interface AgentStatus {
  name:        AgentName;
  healthy:     boolean;
  lastRunMs:   number;
  lastError:   string | null;
  decisions:   number;          // total decisions taken this session
}

export interface PlatformMetrics {
  totalUsers:     number;
  liveStreams:    number;
  gstVolume24h:  number;
  activeAgencies: number;
  activeEvents:   number;
  pendingPayouts: number;
  // Infrastructure
  settlementQueueDepth: number;
  // Security
  flaggedAccounts: number;
  // Economy
  rewardMultiplier: number;
}

export interface GovernorState {
  running:     boolean;
  cycleCount:  number;
  uptime:      number;           // seconds
  agents:      AgentStatus[];
  decisions:   Decision[];       // last 100
  metrics:     PlatformMetrics;
}

// ── Abstract Agent base ────────────────────────────────────────────────────

export abstract class BaseAgent {
  abstract readonly name: AgentName;

  private _decisions = 0;
  private _lastRunMs = 0;
  private _lastError: string | null = null;

  /** Called once per governance cycle. */
  abstract execute(metrics: PlatformMetrics): Promise<Decision[]>;

  /** Internal bookkeeping — called by the governor. */
  async _run(metrics: PlatformMetrics): Promise<Decision[]> {
    const t0 = Date.now();
    try {
      const decisions = await this.execute(metrics);
      this._decisions += decisions.length;
      this._lastError = null;
      this._lastRunMs = Date.now() - t0;
      return decisions;
    } catch (err) {
      this._lastError = String(err);
      this._lastRunMs = Date.now() - t0;
      return [];
    }
  }

  get status(): AgentStatus {
    return {
      name:      this.name,
      healthy:   this._lastError === null,
      lastRunMs: this._lastRunMs,
      lastError: this._lastError,
      decisions: this._decisions,
    };
  }
}

// ── Governor ──────────────────────────────────────────────────────────────

export class GhostBrainGovernor extends EventEmitter {
  private agents: BaseAgent[] = [];
  private decisions: Decision[] = [];
  private cycleCount = 0;
  private startTime = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;
  private _metrics: PlatformMetrics = defaultMetrics();
  private metricsFetcher: (() => Promise<PlatformMetrics>) | null = null;

  /** Plug in the metrics source (e.g. SQLite queries from the backend). */
  setMetricsFetcher(fn: () => Promise<PlatformMetrics>) {
    this.metricsFetcher = fn;
  }

  registerAgent(agent: BaseAgent) {
    this.agents.push(agent);
    this.emit('agent:registered', agent.name);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this._cycle(), CYCLE_INTERVAL_MS);
    this._cycle();                         // run immediately on start
    this.emit('governor:started');
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.emit('governor:stopped');
  }

  get state(): GovernorState {
    return {
      running:    this.timer !== null,
      cycleCount: this.cycleCount,
      uptime:     Math.floor((Date.now() - this.startTime) / 1000),
      agents:     this.agents.map(a => a.status),
      decisions:  this.decisions.slice(-100),
      metrics:    this._metrics,
    };
  }

  /**
   * Enforce L3-only chain rule.
   * Any subsystem passing a chainId here will be blocked if it's not 903.
   */
  enforceL3(chainId: number): void {
    if (chainId !== GHOST_L3_CHAIN_ID) {
      const decision: Decision = {
        agent:     'security',
        action:    'BLOCK_TRANSACTION',
        reason:    `Chain ID ${chainId} rejected — only GhostL3 (${GHOST_L3_CHAIN_ID}) is allowed`,
        severity:  'critical',
        timestamp: Date.now(),
      };
      this._record(decision);
      throw new Error(decision.reason);
    }
  }

  private async _cycle() {
    this.cycleCount++;

    // Refresh metrics
    if (this.metricsFetcher) {
      try { this._metrics = await this.metricsFetcher(); } catch { /* keep stale */ }
    }

    // Run all agents in parallel
    const results = await Promise.all(
      this.agents.map(agent => agent._run(this._metrics))
    );

    for (const batch of results) {
      for (const d of batch) {
        this._record(d);
        this.emit('decision', d);
      }
    }

    this.emit('cycle:complete', { cycle: this.cycleCount, decisions: results.flat().length });
  }

  private _record(d: Decision) {
    this.decisions.push(d);
    if (this.decisions.length > 500) this.decisions.shift();
  }
}

function defaultMetrics(): PlatformMetrics {
  return {
    totalUsers: 0, liveStreams: 0, gstVolume24h: 0,
    activeAgencies: 0, activeEvents: 0, pendingPayouts: 0,
    settlementQueueDepth: 0, flaggedAccounts: 0, rewardMultiplier: 1.0,
  };
}

/** Singleton governor instance shared across the AI service. */
export const governor = new GhostBrainGovernor();
