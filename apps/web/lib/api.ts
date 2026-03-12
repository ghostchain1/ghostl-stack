/**
 * GhostStack — shared data fetching hooks
 */

const SCP = process.env.NEXT_PUBLIC_SCP_URL ?? "http://localhost:9500";

export interface ServiceHealth {
  name:      string;
  url:       string;
  reachable: boolean;
  status:    string;
  latencyMs: number;
}

export interface ScpHealth {
  status:        string;
  emergencyStop: boolean;
  cycleCount:    number;
  uptime:        number;
}

export interface ScpStats {
  commandsRouted: number;
  cycleCount:     number;
  governance:     { total: number; pending: number };
  security:       { totalRequests: number; blocked: number };
}

export async function fetchScpHealth(): Promise<ScpHealth | null> {
  try {
    const r = await fetch(`${SCP}/health`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchScpStats(): Promise<ScpStats | null> {
  try {
    const r = await fetch(`${SCP}/stats`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAIStatus(): Promise<ServiceHealth[] | null> {
  try {
    const r = await fetch(`${SCP}/ai/status`, { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json();
    return d.services ?? null;
  } catch { return null; }
}

export async function fetchInfraState() {
  try {
    const r = await fetch(`${SCP}/infrastructure/state`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchGovernanceProposals() {
  try {
    const r = await fetch(`${SCP}/governance/proposals`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}
