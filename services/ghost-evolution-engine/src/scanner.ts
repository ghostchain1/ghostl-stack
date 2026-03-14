/**
 * GhostStack Evolution Engine — Scanner
 *
 * Calls ghost-ai-swarm-v2 architect agent to analyse the ecosystem,
 * then merges results with the legacy ghost-evolution /scan endpoint.
 */

import { fetch } from "undici";

export interface ScanGap {
  feature:  string;
  category: string;
  priority: "high" | "medium" | "low";
}

export interface ScanResult {
  coveragePct: number;
  gaps:        ScanGap[];
  source:      string;
  scannedAt:   string;
}

const SWARM_V2_URL = process.env.SWARM_V2_URL     ?? "http://127.0.0.1:7970";
const EVOLUTION_URL = process.env.GHOST_EVOLUTION_URL ?? "http://127.0.0.1:7962";

export async function scanEcosystem(): Promise<ScanResult> {
  const [swarmResult, legacyResult] = await Promise.allSettled([
    callSwarmArchitect(),
    callLegacyEvolution(),
  ]);

  const gaps:    ScanGap[] = [];
  let coveragePct          = 0;
  let sources              = 0;

  if (swarmResult.status === "fulfilled") {
    gaps.push(...swarmResult.value.gaps);
    coveragePct += swarmResult.value.coveragePct;
    sources++;
  }

  if (legacyResult.status === "fulfilled") {
    // Merge legacy gaps, dedup by feature name
    const existing = new Set(gaps.map(g => g.feature));
    for (const g of legacyResult.value.gaps) {
      if (!existing.has(g.feature)) {
        gaps.push(g);
        existing.add(g.feature);
      }
    }
    if (sources === 0) {
      coveragePct = legacyResult.value.coveragePct;
    } else {
      // Average with legacy
      coveragePct = (coveragePct + legacyResult.value.coveragePct) / 2;
    }
    sources++;
  }

  const source = sources === 2 ? "swarm-v2+legacy" : sources === 1 ? "partial" : "offline";

  return {
    coveragePct: +coveragePct.toFixed(1),
    gaps:        gaps.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)),
    source,
    scannedAt:   new Date().toISOString(),
  };
}

function priorityRank(p: ScanGap["priority"]): number {
  return p === "high" ? 0 : p === "medium" ? 1 : 2;
}

async function callSwarmArchitect(): Promise<{ coveragePct: number; gaps: ScanGap[] }> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 15_000);

  const res = await fetch(`${SWARM_V2_URL}/tasks`, {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify({ targetRole: "architect", type: "analyze-ecosystem", payload: {} }),
    signal:  ctrl.signal,
  });

  if (!res.ok) throw new Error(`Swarm returned ${res.status}`);
  const body = await res.json() as { data?: { coveragePct?: number; gaps?: ScanGap[] } };
  return {
    coveragePct: body.data?.coveragePct ?? 0,
    gaps:        (body.data?.gaps       ?? []) as ScanGap[],
  };
}

async function callLegacyEvolution(): Promise<{ coveragePct: number; gaps: ScanGap[] }> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 10_000);

  const res = await fetch(`${EVOLUTION_URL}/scan`, { signal: ctrl.signal });
  if (!res.ok) throw new Error(`Legacy evolution returned ${res.status}`);
  const body = await res.json() as { coveragePct?: number; missing?: string[] };

  const gaps: ScanGap[] = (body.missing ?? []).map(f => ({
    feature:  f,
    category: "unknown",
    priority: "medium" as const,
  }));

  return { coveragePct: body.coveragePct ?? 0, gaps };
}
