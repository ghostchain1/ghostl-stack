"use client";
import { useState, useCallback } from "react";
import useSWR from "swr";
import type { AIEngineHealth } from "@/services/aiService";
import { AIEngineStatusPanel } from "@/components/panels/AIEngineStatusPanel";
import { C3_CONFIG } from "@/config/ghostConfig";

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function AIPage() {
  const { data, isLoading, mutate } = useSWR<AIEngineHealth[]>(
    "/api/ai/status",
    fetcher,
    { refreshInterval: C3_CONFIG.refreshIntervals.ai },
  );

  const [actionResult, setActionResult] = useState<string | null>(null);

  const handleAction = useCallback(async (engineId: string, action: string) => {
    setActionResult(`Sending ${action} → ${engineId}…`);
    try {
      const res = await fetch("/api/control/action", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ engineId, action }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      setActionResult(data.success ? `✅ ${engineId}/${action} — OK` : `❌ ${data.error ?? "failed"}`);
    } catch (e) {
      setActionResult(`❌ Network error: ${String(e)}`);
    }
    setTimeout(() => setActionResult(null), 4000);
  }, []);

  const engines = data ?? [];
  const online  = engines.filter(e => e.status === "online").length;
  const offline = engines.filter(e => e.status === "offline").length;
  const avgLat  = engines.filter(e => e.latencyMs > 0).reduce((s, e) => s + e.latencyMs, 0) / Math.max(engines.filter(e => e.latencyMs > 0).length, 1);

  return (
    <>
      <div className="page-header">
        <h1>🤖 AI Engine Fleet</h1>
        <p>Health status and control interface for all 15 GhostStack AI engines — ports 9970–9987</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card"><div className="stat-label">Online</div><div className="stat-value text-green">{isLoading ? "…" : online}</div></div>
        <div className="stat-card"><div className="stat-label">Offline</div><div className="stat-value text-red">{isLoading ? "…" : offline}</div></div>
        <div className="stat-card"><div className="stat-label">Total Engines</div><div className="stat-value">{engines.length || 15}</div></div>
        <div className="stat-card"><div className="stat-label">Avg Latency</div><div className="stat-value">{isLoading ? "…" : `${avgLat.toFixed(0)}ms`}</div></div>
      </div>

      {/* Action feedback */}
      {actionResult && (
        <div className="card" style={{ marginBottom: "1rem", borderLeft: "3px solid var(--accent)", fontSize: "0.85rem" }}>
          {actionResult}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex-between" style={{ marginBottom: "0.75rem" }}>
        <span className="section-title">Engine Status</span>
        <button className="btn btn-ghost" onClick={() => mutate()}>↻ Refresh All</button>
      </div>

      {/* Engine panel */}
      {isLoading
        ? <div style={{ color: "var(--text-muted)" }}>Polling all 15 engine health endpoints…</div>
        : <AIEngineStatusPanel engines={engines} onAction={handleAction} />
      }

      {/* Known ports reference */}
      <div className="card mt-3">
        <div className="card-title">Engine Port Reference</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.4rem" }}>
          {Object.entries(C3_CONFIG.engines).map(([id, cfg]) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", padding: "0.3rem 0.5rem", background: "var(--surface-2)", borderRadius: 4 }}>
              <span style={{ color: "var(--text-muted)" }}>{cfg.label}</span>
              <span className="mono" style={{ color: "var(--accent)" }}>:{cfg.port}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
