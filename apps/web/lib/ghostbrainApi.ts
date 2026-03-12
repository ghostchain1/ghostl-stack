/**
 * ghostbrainApi.ts — Grouped GhostBrain service API client
 *
 * Re-exports all GhostBrain fetch helpers from lib/api.ts organised by
 * subsystem domain, plus adds domain-specific helpers for MCD usage.
 *
 * Usage: import from "@/lib/ghostbrainApi" for a domain-scoped view.
 */

// ── Control Plane / SCP ───────────────────────────────────────────────────────
export {
  fetchScpHealth,
  fetchScpStats,
  fetchAIStatus,
  fetchInfraState,
} from "./api";

// ── AI Infrastructure Manager / AIM ──────────────────────────────────────────
export {
  fetchAimHealth,
  fetchAimTelemetry,
  fetchAimAllocations,
  fetchAimRpcNodes,
  fetchAimCloudNodes,
} from "./api";

// ── Security / TDS ────────────────────────────────────────────────────────────
export {
  fetchTdsHealth,
  fetchTdsStatus,
  fetchTdsIncidents,
} from "./api";

// ── Compliance / ACGE ─────────────────────────────────────────────────────────
export {
  fetchAcgeHealth,
  fetchAcgeAlerts,
  fetchAcgeProposals,
  fetchAcgeAudit,
  fetchAcgeIdentities,
  fetchAcgeRegulations,
} from "./api";

// ── Economy / EIE ─────────────────────────────────────────────────────────────
export {
  fetchEieStatus,
  fetchEieTreasury,
  fetchEieLiquidity,
  fetchEieTokenomics,
  fetchEieMarket,
  fetchEieMarketAlerts,
  fetchEieSimHistory,
  fetchEconomicStatus,
} from "./api";

// ── Governance ────────────────────────────────────────────────────────────────
export {
  fetchGovernanceProposals,
} from "./api";

// ── Intelligence Network / GIN ────────────────────────────────────────────────
export {
  fetchGinHealth,
  fetchGinNodes,
  fetchGinKnowledge,
  fetchGinDecisions,
  fetchGinSwarmTasks,
  fetchGinChainMetrics,
} from "./api";

// ── Evolution Engine / SEE ────────────────────────────────────────────────────
export {
  fetchSeeHealth,
  fetchSeeLatestCycle,
  fetchSeeCodeAnalysis,
  fetchSeeRefactorProposals,
  fetchSeeTopology,
  fetchSeePromotions,
} from "./api";

// ── Kernel ────────────────────────────────────────────────────────────────────
export {
  fetchKernelHealth,
  fetchKernelTelemetry,
  fetchKernelTasks,
  fetchKernelResources,
  fetchKernelServices,
  fetchKernelAgents,
  fetchKernelAudit,
  fetchKernelBusStatus,
  fetchKernelBusEvents,
} from "./api";

// ── Universal Orchestrator ────────────────────────────────────────────────────
export {
  fetchUoStatus,
  fetchUoHealth,
  fetchUoSystems,
  fetchUoCommands,
  fetchUoRoutingTable,
  fetchUoRoutes,
  fetchUoWorkflows,
  fetchUoTasks,
  fetchUoEvents,
} from "./api";

// ── Aggregated system health snapshot ────────────────────────────────────────

const UO = process.env["NEXT_PUBLIC_UO_URL"] ?? "http://localhost:9990";

export interface GhostBrainSystemSummary {
  healthy: number;
  total: number;
  pct: number;
  systems: Record<string, { ok: boolean; latencyMs: number; lastChecked: number }>;
}

export async function fetchSystemSummary(): Promise<GhostBrainSystemSummary | null> {
  try {
    const r = await fetch(`${UO}/systems`, { cache: "no-store" });
    if (!r.ok) return null;
    return r.json() as Promise<GhostBrainSystemSummary>;
  } catch { return null; }
}

export interface UoCommandPayload {
  target: string;
  action: string;
  params?: Record<string, unknown>;
  priority?: "emergency" | "high" | "normal" | "low";
  source?: string;
  requester?: string;
}

export async function sendOrchestratorCommand(cmd: UoCommandPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${UO}/command`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ source: "operator", requester: "mcd", ...cmd }),
    });
    const data = await r.json() as { ok: boolean; command?: { error?: string } };
    return { ok: data.ok, error: data.command?.error };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
