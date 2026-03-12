/**
 * GhostStack — shared data fetching hooks
 */

const SCP = process.env.NEXT_PUBLIC_SCP_URL ?? "http://localhost:9500";
const AIM = process.env.NEXT_PUBLIC_AIM_URL ?? "http://localhost:9950";

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

// ── AIM (Autonomous Infrastructure Manager — port 9950) ───────────────────────

export interface AimHealth {
  status:       string;
  port:         number;
  uptime:       number;
  cycleCount:   number;
  globalAction: string;
  summary:      string;
}

export interface AimTelemetry {
  timestamp:       string;
  hostCpuPct:      number;
  hostCpuLoadAvg:  [number, number, number];
  hostMemTotalMb:  number;
  hostMemFreeMb:   number;
  hostMemUsedPct:  number;
  hostDiskFreeGb:  number;
  vmCount:         number;
  containerCount:  number;
  networkRxBps:    number;
  networkTxBps:    number;
  vms:             Array<{ name: string; state: string; cpuPct: number | null; memPct: number | null; memMb: number; vcpus: number }>;
}

export interface AimAllocationPlan {
  timestamp:      string;
  hostCpuPct:     number;
  hostMemPct:     number;
  globalAction:   string;
  summary:        string;
  vmAllocations:  Array<{ vmName: string; action: string; reason: string; currentCpuPct: number; currentMemPct: number }>;
}

export interface AimRpcNode {
  url:       string;
  region:    string;
  load:      number;
  healthy:   boolean;
  latencyMs?: number;
}

export interface AimCloudNode {
  id:        string;
  provider:  string;
  region:    string;
  role:      string;
  ip?:       string;
  status:    string;
  createdAt: string;
}

export async function fetchAimHealth(): Promise<AimHealth | null> {
  try {
    const r = await fetch(`${AIM}/health`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAimTelemetry(): Promise<AimTelemetry | null> {
  try {
    const r = await fetch(`${AIM}/telemetry`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAimAllocations(): Promise<AimAllocationPlan | null> {
  try {
    const r = await fetch(`${AIM}/allocations`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAimRpcNodes(): Promise<AimRpcNode[] | null> {
  try {
    const r = await fetch(`${AIM}/rpc-nodes`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchAimCloudNodes(): Promise<AimCloudNode[] | null> {
  try {
    const r = await fetch(`${AIM}/cloud/nodes`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// ── TDS (Threat Defense System — port 9960) ───────────────────────────────────

const TDS = process.env.NEXT_PUBLIC_TDS_URL ?? "http://localhost:9960";

export type ThreatLevel = "low" | "medium" | "high" | "critical";

export interface TdsHealth {
  status:      string;
  port:        number;
  uptime:      number;
  cycleCount:  number;
  threatLevel: ThreatLevel;
}

export interface TdsAlert {
  type:      string;
  severity:  string;
  sourceIp?: string;
  user?:     string;
  message:   string;
  count:     number;
  ts:        string;
}

export interface TdsChainThreat {
  type:     string;
  chain:    string;
  severity: string;
  detail:   string;
  ts:       string;
}

export interface TdsAnomaly {
  metric:    string;
  source:    string;
  value:     number;
  baseline:  number;
  zScore:    number;
  severity:  string;
  detail:    string;
  ts:        string;
}

export interface TdsIncident {
  id:          string;
  threat:      { type: string; target?: string; source: string; ts: string };
  actions:     string[];
  status:      string;
  ts:          string;
  resolvedAt?: string;
}

export interface TdsFirewallRule {
  ip:        string;
  action:    string;
  reason:    string;
  createdAt: string;
}

export interface TdsStatus {
  cycleCount:   number;
  threatLevel:  ThreatLevel;
  alerts:       TdsAlert[];
  chainThreats: TdsChainThreat[];
  anomalies:    TdsAnomaly[];
  incidents:    TdsIncident[];
  blockedIps:   TdsFirewallRule[];
  firewall:     { totalBlocked: number; totalRequests: number; autoBlocked: number; manualBlocked: number };
}

export async function fetchTdsHealth(): Promise<TdsHealth | null> {
  try {
    const r = await fetch(`${TDS}/health`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchTdsStatus(): Promise<TdsStatus | null> {
  try {
    const r = await fetch(`${TDS}/status`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function fetchTdsIncidents(): Promise<TdsIncident[] | null> {
  try {
    const r = await fetch(`${TDS}/incidents`, { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}
