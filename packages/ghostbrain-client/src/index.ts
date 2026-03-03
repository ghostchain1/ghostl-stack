/**
 * @ghostchain/ghostbrain-client
 *
 * Lightweight HTTP client for GhostBrain Core agent registration & heartbeat.
 *
 * Uses built-in Node.js fetch (≥ 18). Zero extra runtime dependencies.
 *
 * Subject conventions (NATS, mirrored via HTTP gateway):
 *   ghostbrain.agent.register        — agent → brain: registration
 *   ghostbrain.signal.health         — agent → brain: health heartbeat
 *   ghostbrain.signal.anomaly        — agent → brain: anomaly signal
 *
 * Usage:
 *   import { GhostBrainClient } from '@ghostchain/ghostbrain-client';
 *
 *   const brain = new GhostBrainClient({
 *     agentId: 'my-service',
 *     role: 'sentinel',
 *     capabilities: ['metrics.query'],
 *     resourceScopes: [{ type: 'stack', name: 'my-service', layer: 'L2' }],
 *     layer: 'L2',
 *   });
 *
 *   await brain.register();    // call once after server is listening
 *   brain.startHeartbeat();    // periodic health pings (default 30s)
 */

// ─── Types (mirrors ghostbrain-core/src/types.ts) ────────────────────────────

export type AgentRole =
  | 'sentinel'
  | 'diagnostician'
  | 'planner'
  | 'executor'
  | 'auditor'
  | 'governor';

export type AgentCapability =
  | 'docker.restart'
  | 'docker.ps'
  | 'compose.apply'
  | 'compose.reconcile'
  | 'compose.canary'
  | 'libvirt.snapshot'
  | 'libvirt.status'
  | 'libvirt.start'
  | 'libvirt.stop'
  | 'network.firewall.read'
  | 'network.dns.update'
  | 'network.tls.renew'
  | 'db.backup.verify'
  | 'db.replication.status'
  | 'db.migration.apply'
  | 'vault.health'
  | 'metrics.query'
  | 'logs.query'
  | 'policy.evaluate';

export type Layer = 'L1' | 'L2' | 'L3';

export type ResourceScope = {
  type: 'vm' | 'stack' | 'domain' | 'db' | 'network';
  name: string;
  layer: Layer;
};

export type GhostBrainClientOptions = {
  /** Unique agent identifier — use the service name. */
  agentId: string;
  role: AgentRole;
  capabilities: AgentCapability[];
  resourceScopes: ResourceScope[];
  /** Routing-law layer this agent operates on. */
  layer: Layer;
  /**
   * Base URL of GhostBrain Core HTTP API.
   * Falls back to GHOSTBRAIN_URL env var, then http://ghostbrain-core:7900.
   */
  ghostbrainUrl?: string;
  /**
   * Disable all GhostBrain calls.
   * Falls back to GHOSTBRAIN_ENABLED env var (default: true).
   */
  enabled?: boolean;
  /** Heartbeat interval in ms (default: 30 000). */
  heartbeatIntervalMs?: number;
  /** Structured logger — defaults to console JSON lines. */
  logger?: {
    info:  (msg: string, meta?: Record<string, unknown>) => void;
    warn:  (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
};

const DEFAULT_URL            = 'http://ghostbrain-core:7900';
const DEFAULT_HEARTBEAT_MS   = 30_000;
const REGISTER_TIMEOUT_MS    = 5_000;
const SIGNAL_TIMEOUT_MS      = 3_000;
const REGISTER_RETRY_DELAY_MS = 3_000;

// ─── Client ───────────────────────────────────────────────────────────────────

export class GhostBrainClient {
  private readonly agentId: string;
  private readonly role: AgentRole;
  private readonly capabilities: AgentCapability[];
  private readonly resourceScopes: ResourceScope[];
  private readonly layer: Layer;
  private readonly url: string;
  readonly enabled: boolean;
  private readonly heartbeatIntervalMs: number;
  private readonly log: NonNullable<GhostBrainClientOptions['logger']>;
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: GhostBrainClientOptions) {
    this.agentId           = opts.agentId;
    this.role              = opts.role;
    this.capabilities      = opts.capabilities;
    this.resourceScopes    = opts.resourceScopes;
    this.layer             = opts.layer;
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS;

    // Resolve URL
    const rawUrl = opts.ghostbrainUrl ?? process.env['GHOSTBRAIN_URL'] ?? DEFAULT_URL;
    this.url = rawUrl.replace(/\/$/, '');

    // Resolve enabled flag
    const envEnabled = process.env['GHOSTBRAIN_ENABLED'];
    if (opts.enabled !== undefined) {
      this.enabled = opts.enabled;
    } else if (envEnabled !== undefined) {
      this.enabled = envEnabled !== 'false' && envEnabled !== '0';
    } else {
      this.enabled = true;
    }

    // Resolve logger
    const id = this.agentId;
    this.log = opts.logger ?? {
      info:  (msg, meta) => console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info',  service: id, msg, ...meta })),
      warn:  (msg, meta) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: 'warn',  service: id, msg, ...meta })),
      error: (msg, meta) => console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', service: id, msg, ...meta })),
    };
  }

  // ─── Registration ───────────────────────────────────────────────────────────

  /**
   * Register this agent with GhostBrain Core via HTTP.
   * Retries up to `retries` times before giving up (non-fatal).
   */
  async register(retries = 5): Promise<void> {
    if (!this.enabled) return;

    const body = {
      agentId:        this.agentId,
      role:           this.role,
      capabilities:   this.capabilities,
      resourceScopes: this.resourceScopes,
      natsSubject:    `ghostbrain.agent.${this.agentId}.task`,
      healthy:        true,
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${this.url}/api/v1/agents/register`, {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify(body),
          signal:  AbortSignal.timeout(REGISTER_TIMEOUT_MS),
        });
        if (res.ok) {
          this.log.info('Registered with GhostBrain Core', {
            agentId: this.agentId,
            role:    this.role,
            url:     this.url,
          });
          return;
        }
        this.log.warn(`GhostBrain registration HTTP ${res.status}`, { agentId: this.agentId, attempt, retries });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.log.warn(`GhostBrain registration error: ${message}`, { agentId: this.agentId, attempt, retries });
      }
      if (attempt < retries) await _sleep(REGISTER_RETRY_DELAY_MS);
    }
    this.log.error('GhostBrain registration failed — running in standalone mode', { agentId: this.agentId });
  }

  // ─── Health signals ─────────────────────────────────────────────────────────

  /** Post a single health signal. Non-fatal on error. */
  async sendHealthSignal(anomaly = false, extra?: Record<string, unknown>): Promise<void> {
    if (!this.enabled) return;
    try {
      await fetch(`${this.url}/api/v1/signals`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source:      'manual',
          service:     this.agentId,
          layer:       this.layer,
          anomaly,
          observedAt:  new Date().toISOString(),
          ...extra,
        }),
        signal: AbortSignal.timeout(SIGNAL_TIMEOUT_MS),
      });
    } catch {
      // heartbeat failure is non-fatal; don't spam logs
    }
  }

  /** Publish an anomaly signal to GhostBrain (triggers incident assessment). */
  async sendAnomalySignal(metric: string, value: number, threshold: number): Promise<void> {
    await this.sendHealthSignal(true, { metric, value, threshold });
  }

  // ─── Heartbeat ──────────────────────────────────────────────────────────────

  /**
   * Start a periodic health heartbeat (fire-and-forget).
   * The timer is unref'd so it won't prevent process exit.
   */
  startHeartbeat(): void {
    if (!this.enabled || this._heartbeatTimer) return;
    this._heartbeatTimer = setInterval(
      () => void this.sendHealthSignal(),
      this.heartbeatIntervalMs,
    );
    this._heartbeatTimer.unref?.();
    this.log.info('GhostBrain heartbeat started', {
      agentId:    this.agentId,
      intervalMs: this.heartbeatIntervalMs,
    });
  }

  stopHeartbeat(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
