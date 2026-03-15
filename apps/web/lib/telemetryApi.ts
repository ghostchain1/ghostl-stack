/**
 * telemetryApi.ts — REST-based telemetry polling helpers
 *
 * Provides fallback data-fetching for pages that don't use the useTelemetry
 * WebSocket hook, and aggregated health snapshots for server components.
 */

const UO  = process.env["NEXT_PUBLIC_UO_URL"]  ?? "http://localhost:9990";
const KRN = process.env["NEXT_PUBLIC_KERNEL_URL"] ?? "http://localhost:9300";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SystemMetrics {
  totalSystems: number;
  healthySystems: number;
  healthPct: number;
  activeTasks: number;
  criticalAlerts: number;
  uptimeSeconds: number;
}

export interface TelemetryAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  source: string;
  message: string;
  ts: number;
}

export interface RecentActivityEntry {
  id: string;
  type: string;
  source: string;
  summary: string;
  ts: number;
}

// ── Aggregated system metrics ─────────────────────────────────────────────────

export async function fetchSystemMetrics(): Promise<SystemMetrics | null> {
  try {
    const [uoRes, krnRes] = await Promise.allSettled([
      fetch(`${UO}/systems`,  { cache: "no-store" }),
      fetch(`${KRN}/health`,  { cache: "no-store" }),
    ]);

    const uo  = uoRes.status  === "fulfilled" && uoRes.value.ok  ? await uoRes.value.json()  as Record<string,unknown> : null;
    const krn = krnRes.status === "fulfilled" && krnRes.value.ok ? await krnRes.value.json() as Record<string,unknown> : null;

    const totalSystems   = typeof uo?.["totalSystems"]   === "number" ? uo["totalSystems"]   : 26;
    const healthySystems = typeof uo?.["healthySystems"] === "number" ? uo["healthySystems"] : 0;
    const activeTasks    = typeof krn?.["activeTasks"]   === "number" ? krn["activeTasks"]   : 0;
    const uptimeSeconds  = typeof uo?.["uptimeSeconds"]  === "number" ? uo["uptimeSeconds"]  : 0;

    return {
      totalSystems,
      healthySystems,
      healthPct: totalSystems > 0 ? Math.round((healthySystems / totalSystems) * 100) : 0,
      activeTasks,
      criticalAlerts: 0,
      uptimeSeconds,
    };
  } catch { return null; }
}

// ── Critical alerts from UO event stream ─────────────────────────────────────

export async function fetchCriticalAlerts(limit = 20): Promise<TelemetryAlert[]> {
  try {
    const r = await fetch(`${UO}/events?severity=critical&limit=${limit}`, { cache: "no-store" });
    if (!r.ok) return [];
    const raw = await r.json() as { events?: unknown[] };
    return (raw.events ?? []).map((e) => {
      const ev = e as Record<string, unknown>;
      return {
        id:       String(ev["id"]      ?? crypto.randomUUID()),
        severity: (ev["severity"] as TelemetryAlert["severity"]) ?? "warning",
        source:   String(ev["source"]  ?? "unknown"),
        message:  String(ev["message"] ?? ev["summary"] ?? ""),
        ts:       Number(ev["ts"]      ?? ev["timestamp"] ?? Date.now()),
      };
    });
  } catch { return []; }
}

// ── Recent activity from UO ───────────────────────────────────────────────────

export async function fetchRecentActivity(limit = 30): Promise<RecentActivityEntry[]> {
  try {
    const r = await fetch(`${UO}/events?limit=${limit}`, { cache: "no-store" });
    if (!r.ok) return [];
    const raw = await r.json() as { events?: unknown[] };
    return (raw.events ?? []).map((e) => {
      const ev = e as Record<string, unknown>;
      return {
        id:      String(ev["id"]    ?? crypto.randomUUID()),
        type:    String(ev["type"]  ?? "event"),
        source:  String(ev["source"] ?? "system"),
        summary: String(ev["message"] ?? ev["payload"] ?? ev["summary"] ?? ""),
        ts:      Number(ev["ts"]    ?? ev["timestamp"] ?? Date.now()),
      };
    });
  } catch { return []; }
}

// ── Uptime formatter helper ───────────────────────────────────────────────────

export function formatUptime(seconds: number): string {
  if (seconds < 60)     return `${seconds}s`;
  if (seconds < 3600)   return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d}d ${h}h`;
}
