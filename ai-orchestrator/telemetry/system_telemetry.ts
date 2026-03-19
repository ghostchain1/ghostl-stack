/**
 * GhostStack Global AI Orchestrator — System Telemetry
 *
 * Collects and aggregates health metrics from every layer of the GhostStack:
 *   - GhostChain L1  (chain_id 14000101, RPC :18545)
 *   - GhostL2        (chain_id 901,       RPC :7260)
 *   - GhostL3        (chain_id 903,       RPC :7270)
 *   - GhostBrain Core (:7900)
 *   - All registered orchestrator agents
 *
 * Each call to collect() produces a TelemetrySnapshot that is:
 *   1. Appended to a bounded in-memory history (MAX_TELEMETRY_HISTORY entries).
 *   2. Published to GhostBrain at /telemetry/snapshot for cross-system storage.
 *
 * Agent providers are registered via registerAgent() so that orchestrator
 * components can push their health data without creating circular imports.
 *
 * Chain: GhostChain L1 (chain_id 14000101). Gas token: GST.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const L1_CHAIN_ID = 14000101 as const;

const MAX_TELEMETRY_HISTORY = 500;

const GHOSTBRAIN_URL = process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900";
const L1_RPC_URL     = process.env["L1_RPC_URL"]         ?? "http://localhost:18545";
const L2_RPC_URL     = process.env["L2_RPC_URL"]         ?? "http://localhost:7260";
const L3_RPC_URL     = process.env["L3_RPC_URL"]         ?? "http://localhost:7270";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChainHealth {
  chainId:     number;
  label:       string;
  reachable:   boolean;
  blockHeight: number | null;
  latencyMs:   number | null;
  checkedAt:   number;  // Unix seconds
}

export interface BrainHealth {
  reachable:     boolean;
  activeSignals: number | null;
  latencyMs:     number | null;
  checkedAt:     number;
}

export interface AgentTelemetry {
  name:         string;
  healthy:      boolean;
  lastTaskAt:   number | null;
  errorCount:   number;
  successCount: number;
}

export interface SystemMetrics {
  cpuPct: number | null;
  memPct: number | null;
}

export interface TelemetrySnapshot {
  snapshotId:  string;
  chains:      ChainHealth[];
  brain:       BrainHealth;
  agents:      AgentTelemetry[];
  system:      SystemMetrics;
  collectedAt: number;  // Unix seconds
  chain_id:    number;
  gas_token:   string;
}

export interface SystemTelemetryOptions {
  ghostbrainUrl?: string;
  l1RpcUrl?:      string;
  l2RpcUrl?:      string;
  l3RpcUrl?:      string;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── SystemTelemetry ───────────────────────────────────────────────────────────

export class SystemTelemetry {
  private readonly ghostbrainUrl: string;
  private readonly l1RpcUrl:      string;
  private readonly l2RpcUrl:      string;
  private readonly l3RpcUrl:      string;
  private readonly fetcher:       (url: string, init?: RequestInit) => Promise<Response>;

  private readonly history:         TelemetrySnapshot[] = [];
  private readonly agentProviders:  (() => AgentTelemetry)[] = [];
  private snapshotSeq               = 0;

  constructor(opts: SystemTelemetryOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? GHOSTBRAIN_URL;
    this.l1RpcUrl      = opts.l1RpcUrl      ?? L1_RPC_URL;
    this.l2RpcUrl      = opts.l2RpcUrl      ?? L2_RPC_URL;
    this.l3RpcUrl      = opts.l3RpcUrl      ?? L3_RPC_URL;
    this.fetcher       = opts.fetcher       ?? ((u, i) => fetch(u, i));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register an agent health provider.
   * The provider is called on every collect() invocation.
   */
  registerAgent(provider: () => AgentTelemetry): void {
    this.agentProviders.push(provider);
  }

  /** Collect a full telemetry snapshot and publish it to GhostBrain. */
  async collect(): Promise<TelemetrySnapshot> {
    const [chains, brain, system] = await Promise.all([
      this._collectChains(),
      this._collectBrain(),
      this._collectSystem(),
    ]);

    const agents = this.agentProviders.map((p) => {
      try {
        return p();
      } catch {
        return {
          name: "unknown",
          healthy: false,
          lastTaskAt: null,
          errorCount: 0,
          successCount: 0,
        } satisfies AgentTelemetry;
      }
    });

    const snapshot: TelemetrySnapshot = {
      snapshotId:  `tel-${++this.snapshotSeq}-${Date.now()}`,
      chains,
      brain,
      agents,
      system,
      collectedAt: nowSec(),
      chain_id:    L1_CHAIN_ID,
      gas_token:   "GST",
    };

    this.history.push(snapshot);
    if (this.history.length > MAX_TELEMETRY_HISTORY) this.history.shift();

    void this._publish(snapshot);
    return snapshot;
  }

  /** Most recent snapshot, or undefined if none collected yet. */
  latest(): TelemetrySnapshot | undefined {
    return this.history.length > 0 ? this.history[this.history.length - 1] : undefined;
  }

  /** Recent snapshots, newest first. */
  recent(limit = 10): TelemetrySnapshot[] {
    return this.history.slice(-limit).reverse();
  }

  // ── Chain health ───────────────────────────────────────────────────────────

  private _collectChains(): Promise<ChainHealth[]> {
    return Promise.all([
      this._checkChain(L1_CHAIN_ID, "GhostChain L1", this.l1RpcUrl),
      this._checkChain(901,          "GhostL2",        this.l2RpcUrl),
      this._checkChain(903,          "GhostL3",        this.l3RpcUrl),
    ]);
  }

  private async _checkChain(
    chainId: number,
    label:   string,
    rpcUrl:  string,
  ): Promise<ChainHealth> {
    const t0 = Date.now();
    try {
      const res = await this.fetcher(rpcUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          jsonrpc: "2.0",
          method:  "ghost_blockNumber",
          params:  [],
          id:      1,
        }),
      });
      const latencyMs = Date.now() - t0;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as { result?: string };
      const blockHeight = data.result !== undefined ? parseInt(data.result, 16) : null;
      return { chainId, label, reachable: true, blockHeight, latencyMs, checkedAt: nowSec() };
    } catch {
      return { chainId, label, reachable: false, blockHeight: null, latencyMs: null, checkedAt: nowSec() };
    }
  }

  // ── GhostBrain health ──────────────────────────────────────────────────────

  private async _collectBrain(): Promise<BrainHealth> {
    const t0 = Date.now();
    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/health`, {});
      const latencyMs = Date.now() - t0;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { active_signals?: number };
      return {
        reachable:     true,
        activeSignals: data.active_signals ?? null,
        latencyMs,
        checkedAt:     nowSec(),
      };
    } catch {
      return { reachable: false, activeSignals: null, latencyMs: null, checkedAt: nowSec() };
    }
  }

  // ── System metrics ─────────────────────────────────────────────────────────

  private async _collectSystem(): Promise<SystemMetrics> {
    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/system/metrics`, {});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { cpu_pct?: number; mem_pct?: number };
      return { cpuPct: data.cpu_pct ?? null, memPct: data.mem_pct ?? null };
    } catch {
      return { cpuPct: null, memPct: null };
    }
  }

  // ── Publish ────────────────────────────────────────────────────────────────

  private async _publish(snapshot: TelemetrySnapshot): Promise<void> {
    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/telemetry/snapshot`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(snapshot),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[SystemTelemetry] GhostBrain publish failed:", err.message);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
