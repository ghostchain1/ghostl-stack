/**
 * RPC Pool — continuous health monitoring, head-lag tracking, and
 * circuit-breaker per endpoint.
 *
 * Health probe runs on a configurable interval (default 5 s).  Each probe
 * updates latency, head-lag and error-rate via exponential moving averages.
 * After `FAILURE_THRESHOLD` consecutive failures the endpoint circuit opens.
 * The circuit closes automatically after an exponential back-off period.
 */

import { JsonRpcProvider } from "ethers";
import type { RpcHealth } from "./ai-engine.js";

const FAILURE_THRESHOLD = 3;
const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS     = 60_000;

type PoolEntry = {
  url:          string;
  layer:        RpcHealth["layer"];
  provider:     JsonRpcProvider;
  health:       RpcHealth;
  failures:     number;
  circuitUntil: number; // epoch ms; 0 = closed
};

export class RpcPool {
  private entries: PoolEntry[];
  private probeInterval?: ReturnType<typeof setInterval>;

  constructor(urls: Array<{ url: string; layer: RpcHealth["layer"] }>) {
    this.entries = urls.map(({ url, layer }) => ({
      url,
      layer,
      provider: new JsonRpcProvider(url),
      failures:     0,
      circuitUntil: 0,
      health: {
        url,
        layer,
        latencyMs:   9999,
        errorRate:   0,
        headLag:     9999,
        lastOkAt:    0,
        circuitOpen: false,
      },
    }));
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  startHealthLoop(periodMs = 5_000): this {
    this.stopHealthLoop();
    this.probeInterval = setInterval(() => void this._probeAll(), periodMs);
    // unref so the interval doesn't keep a Node process alive
    if (typeof this.probeInterval.unref === "function") this.probeInterval.unref();
    void this._probeAll();
    return this;
  }

  stopHealthLoop(): this {
    if (this.probeInterval) {
      clearInterval(this.probeInterval);
      this.probeInterval = undefined;
    }
    return this;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Return a health snapshot for every endpoint on the given layer. */
  list(layer: RpcHealth["layer"]): RpcHealth[] {
    const now = Date.now();
    return this.entries
      .filter(e => e.layer === layer)
      .map(e => {
        // reconcile circuit state lazily
        e.health.circuitOpen = e.circuitUntil > now;
        return { ...e.health };
      });
  }

  /** Return the ghost provider for a known URL. */
  getProvider(url: string): JsonRpcProvider {
    const entry = this.entries.find(e => e.url === url);
    if (!entry) throw new Error(`RPC not found in pool: ${url}`);
    return entry.provider;
  }

  // ── Feedback (called by AutonomousGhostProvider on real request outcomes) ───

  markSuccess(url: string, latencyMs: number, headNumber: number, bestHead: number): void {
    const e = this.entries.find(x => x.url === url);
    if (!e) return;
    e.failures          = Math.max(0, e.failures - 1);
    e.circuitUntil      = 0;
    e.health.circuitOpen = false;
    e.health.latencyMs   = ema(e.health.latencyMs, latencyMs, 0.25);
    e.health.headLag     = Math.max(0, bestHead - headNumber);
    e.health.lastOkAt    = Date.now();
    e.health.errorRate   = clamp01(e.health.errorRate * 0.9);
  }

  markFailure(url: string): void {
    const e = this.entries.find(x => x.url === url);
    if (!e) return;
    e.failures++;
    e.health.errorRate = clamp01(e.health.errorRate * 0.85 + 0.15);
    if (e.failures >= FAILURE_THRESHOLD) {
      const backoff = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** (e.failures - FAILURE_THRESHOLD));
      e.circuitUntil      = Date.now() + backoff;
      e.health.circuitOpen = true;
    }
  }

  // ── Health probe ────────────────────────────────────────────────────────────

  private async _probeAll(): Promise<void> {
    const now = Date.now();
    const pLayer = new Map<RpcHealth["layer"], number[]>();

    // Probe every non-circuit-open entry concurrently
    const results = await Promise.all(
      this.entries.map(async (e): Promise<{ e: PoolEntry; ok: boolean; latency: number; head?: number }> => {
        if (e.circuitUntil > now) return { e, ok: false, latency: 9999 };
        const t0 = performance.now();
        try {
          const head    = await e.provider.getBlockNumber();
          const latency = Math.max(1, performance.now() - t0);
          const arr = pLayer.get(e.layer) ?? [];
          arr.push(head);
          pLayer.set(e.layer, arr);
          return { e, ok: true, latency, head };
        } catch {
          return { e, ok: false, latency: 9999 };
        }
      })
    );

    // Best head per layer
    const bestHead = new Map<RpcHealth["layer"], number>();
    for (const [layer, heads] of pLayer) bestHead.set(layer, Math.max(...heads));

    // Apply results
    for (const { e, ok, latency, head } of results) {
      if (ok && head !== undefined) {
        this.markSuccess(e.url, latency, head, bestHead.get(e.layer) ?? head);
      } else if (e.circuitUntil <= now) {
        // only penalise if not already in forced back-off
        this.markFailure(e.url);
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Exponential moving average with smoothing factor α (0..1). */
function ema(prev: number, next: number, α: number): number {
  return prev * (1 - α) + next * α;
}
