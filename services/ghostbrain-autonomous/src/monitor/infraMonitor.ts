/**
 * Infrastructure Monitor (Phase 45)
 *
 * DETECT-ONLY — never calls write APIs.
 *
 * Monitors Docker containers and checks cross-chain liquidity balance.
 * Returns proposals for containers that are not running and for
 * severe liquidity imbalances across bridge pools.
 */

import { CONFIG, RULES } from "../config/rules.js";
import type { Proposal } from "../types.js";

let fetchFn: typeof fetch;

async function getFetch() {
  if (fetchFn) return fetchFn;
  if (typeof globalThis.fetch === "function") {
    fetchFn = globalThis.fetch;
  } else {
    const mod = await import("node-fetch");
    fetchFn = mod.default as unknown as typeof fetch;
  }
  return fetchFn;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface ContainerRecord {
  name?:   string;
  id?:     string;
  status?: string;   // "running" | "exited" | "paused" | ...
  image?:  string;
}

interface LiquidityPool {
  name:    string;
  tvlGST:  number;
  status?: string;
}

/**
 * Inspect Docker containers and liquidity pools.
 * Returns proposals for any downed containers or severe TVL imbalances.
 */
export async function monitorInfrastructure(): Promise<Proposal[]> {
  const proposals: Proposal[] = [];
  const now = new Date().toISOString();
  const f   = await getFetch();

  // ── Docker containers ────────────────────────────────────────────────────
  if (RULES.containerDownAlert) {
    try {
      const r    = await f(`${CONFIG.apiBase}/api/system/docker`, { signal: AbortSignal.timeout(8_000) });
      const data = await r.json() as ContainerRecord[] | { containers?: ContainerRecord[] };
      const containers: ContainerRecord[] = Array.isArray(data)
        ? data
        : (data.containers ?? []);

      for (const c of containers) {
        const name   = c.name ?? c.id ?? "unknown";
        const status = (c.status ?? "").toLowerCase();

        if (status !== "running") {
          proposals.push({
            id: makeId(), type: "alert_container_down",
            kernelType: "docker", action: "start", target: name,
            severity: "critical",
            reason: `Container "${name}" is ${status || "not running"}`,
            payload: { containerName: name, status, image: c.image },
            createdAt: now, status: "pending", source: "infraMonitor",
          });
        }
      }
    } catch (err) {
      console.warn("[infraMonitor] docker fetch failed:", (err as Error).message);
    }
  }

  // ── Liquidity imbalance ──────────────────────────────────────────────────
  try {
    const r    = await f(`${CONFIG.apiBase}/api/bridge/liquidity`, { signal: AbortSignal.timeout(8_000) });
    const data = await r.json() as { pools?: LiquidityPool[] };
    const pools = data.pools ?? [];

    if (pools.length >= 2) {
      const tvls  = pools.map(p => p.tvlGST).filter(v => v > 0);
      const maxT  = Math.max(...tvls);
      const minT  = Math.min(...tvls);
      const ratio = minT > 0 ? maxT / minT : Infinity;

      if (ratio > RULES.liquidityImbalanceRatio) {
        proposals.push({
          id: makeId(), type: "alert_liquidity_imbalance",
          kernelType: "alert", action: "alert", target: "bridge_pools",
          severity: "warning",
          reason: `Liquidity imbalance ratio ${ratio.toFixed(1)}× exceeds threshold ${RULES.liquidityImbalanceRatio}×`,
          payload: { ratio, maxTvlGST: maxT, minTvlGST: minT, poolCount: pools.length },
          createdAt: now, status: "pending", source: "infraMonitor",
        });
      }
    }
  } catch (err) {
    console.warn("[infraMonitor] liquidity fetch failed:", (err as Error).message);
  }

  return proposals;
}
