"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface MarketingData {
  aims: Record<string, unknown> | null;
  vge:  Record<string, unknown> | null;
  timestamp: number;
}

export default function MarketingPage() {
  const { data, isLoading, mutate } = useSWR<MarketingData>("/api/marketing/stats", fetcher, { refreshInterval: 30_000 });
  const aims = data?.aims as Record<string, number | string> | null;
  const vge  = data?.vge  as Record<string, number | string> | null;

  return (
    <>
      <div className="page-header">
        <h1>📣 Marketing Intelligence</h1>
        <p>AI Marketing Engine (9970) and Viral Growth Engine (9971) — campaign and reach telemetry</p>
      </div>

      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <div className="flex gap-1">
          <span className={`badge ${aims ? "badge-green" : "badge-red"}`}><span className="dot" />AIMS :{aims ? "9970" : "offline"}</span>
          <span className={`badge ${vge  ? "badge-green" : "badge-red"}`}><span className="dot" />VGE  :{vge  ? "9971" : "offline"}</span>
        </div>
        <button className="btn btn-ghost" onClick={() => mutate()}>↻ Refresh</button>
      </div>

      {isLoading && <div style={{ color: "var(--text-muted)" }}>Fetching marketing engine stats…</div>}

      {!isLoading && !aims && !vge && (
        <div className="card" style={{ color: "var(--text-muted)", textAlign: "center" }}>
          Both AIMS (9970) and VGE (9971) are offline. Start them with{" "}
          <span className="mono">make aims-dev vge-dev</span>
        </div>
      )}

      {/* AIMS section */}
      {aims && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div className="card-title">📣 AI Marketing Engine (AIMS) — port 9970</div>
          <div className="grid grid-4">
            {Object.entries(aims).filter(([k]) => k !== "insights" && k !== "timestamp").map(([k, v]) => (
              <div key={k} className="stat-card">
                <div className="stat-label">{k.replace(/([A-Z])/g, " $1").trim()}</div>
                <div className="stat-value" style={{ fontSize: "1.2rem" }}>
                  {typeof v === "number" ? v.toLocaleString() : String(v)}
                </div>
              </div>
            ))}
          </div>
          {Array.isArray((aims as Record<string, unknown>).insights) && (
            <div style={{ marginTop: "1rem" }}>
              <div className="card-title">AI Insights</div>
              <ul style={{ paddingLeft: "1.2rem", color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: 1.8 }}>
                {((aims as Record<string, unknown>).insights as string[]).map((ins, i) => <li key={i}>{ins}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* VGE section */}
      {vge && (
        <div className="card">
          <div className="card-title">🚀 Viral Growth Engine (VGE) — port 9971</div>
          <div className="grid grid-4">
            {Object.entries(vge).filter(([k]) => k !== "timestamp").map(([k, v]) => (
              <div key={k} className="stat-card">
                <div className="stat-label">{k.replace(/([A-Z])/g, " $1").trim()}</div>
                <div className="stat-value" style={{ fontSize: "1.2rem" }}>
                  {typeof v === "number" ? v.toLocaleString() : String(v)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
