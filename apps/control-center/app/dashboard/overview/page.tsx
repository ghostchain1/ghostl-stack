// GhostStack C3 — Dashboard Overview
// Server component: fans out to all backends and renders top-level ecosystem KPIs.

import { C3_CONFIG } from "@/config/ghostConfig";

export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function pingEngine(id: string, url: string) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3_000), cache: "no-store" });
    return { id, online: res.ok };
  } catch {
    return { id, online: false };
  }
}

async function getAREData() {
  try {
    const res = await fetch(`${C3_CONFIG.engines.are.url}/summary`, {
      signal: AbortSignal.timeout(4_000), cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json() as Record<string, Record<string, number>>;
  } catch { return null; }
}

async function getChainBlock() {
  try {
    const res = await fetch(C3_CONFIG.chains.ghostchain.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
    const j = await res.json() as { result?: string };
    return j.result ? parseInt(j.result, 16) : null;
  } catch { return null; }
}

// ── UI atoms ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, detail, color = "var(--accent)" }: {
  label: string; value: string; detail?: string; color?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      {detail && <div className="stat-detail">{detail}</div>}
    </div>
  );
}

function usd(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OverviewPage() {
  const [engineResults, areData, blockHeight] = await Promise.all([
    Promise.all(Object.entries(C3_CONFIG.engines).map(([id, cfg]) => pingEngine(id, cfg.url))),
    getAREData(),
    getChainBlock(),
  ]);

  const onlineCount = engineResults.filter(e => e.online).length;
  const totalEngines = engineResults.length;
  const ecosystemHealth = onlineCount === totalEngines ? "Optimal"
    : onlineCount >= Math.ceil(totalEngines * 0.7) ? "Degraded" : "Critical";

  const treasury    = areData?.treasury;
  const defi        = areData?.defi;
  const validators  = areData?.validators;
  const trading     = areData?.trading;

  const statusColor = ecosystemHealth === "Optimal" ? "#10b981" : ecosystemHealth === "Degraded" ? "#f59e0b" : "#ef4444";

  return (
    <>
      <div className="page-header">
        <h1>👻 GhostStack C3 — Ecosystem Overview</h1>
        <p>Unified Command &amp; Control Center · Real-time ecosystem health · {new Date().toUTCString()}</p>
      </div>

      {/* ── Ecosystem health banner ────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1.5rem", borderLeft: `4px solid ${statusColor}`, display: "flex", alignItems: "center", gap: "1rem" }}>
        <div style={{ fontSize: "2rem" }}>{ecosystemHealth === "Optimal" ? "✅" : ecosystemHealth === "Degraded" ? "⚠️" : "🚨"}</div>
        <div>
          <div style={{ fontWeight: 700, color: statusColor }}>{ecosystemHealth} — {onlineCount}/{totalEngines} AI engines online</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            GhostBrain has full visibility across all subsystems · L1 block #{blockHeight?.toLocaleString() ?? "—"}
          </div>
        </div>
      </div>

      {/* ── KPI grid ───────────────────────────────────────────────────────── */}
      <div className="grid grid-5" style={{ marginBottom: "1.5rem" }}>
        <StatCard label="Treasury"         value={treasury ? usd(Number(treasury.totalUSD)) : "—"}     detail={treasury ? `GST $${Number(treasury.gstPriceUSD).toFixed(2)}` : "ARE offline"}   color="#7c3aed" />
        <StatCard label="DeFi TVL"         value={defi    ? usd(Number(defi.totalTvlUSD))   : "—"}     detail={defi    ? `${defi.activePools} active pools`    : ""}             color="#10b981" />
        <StatCard label="Validator Stake"  value={validators ? `${(Number(validators.totalStakeGST)/1_000_000).toFixed(2)}M GST` : "—"} detail={validators ? `${validators.active} active` : ""} color="#f59e0b" />
        <StatCard label="Trading PnL"      value={trading  ? usd(Number(trading.totalPnlUSD)) : "—"}    detail={trading  ? `${trading.runningStrategies} strategies running` : ""} color="#06b6d4" />
        <StatCard label="AI Engines"       value={`${onlineCount}/${totalEngines}`}                     detail={`${ecosystemHealth} status`}                                      color={statusColor} />
      </div>

      {/* ── Architecture diagram ───────────────────────────────────────────── */}
      <div className="grid grid-2" style={{ marginBottom: "1.5rem" }}>

        {/* Engine roster */}
        <div className="card">
          <div className="card-title">AI Engine Fleet Status</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem" }}>
            {engineResults.map(e => {
              const cfg = C3_CONFIG.engines[e.id as keyof typeof C3_CONFIG.engines];
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", padding: "0.3rem 0" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: e.online ? "#10b981" : "#ef4444", flexShrink: 0, display: "inline-block" }} />
                  <span style={{ color: e.online ? "var(--text)" : "var(--text-muted)" }}>{cfg?.label?.split(" ").slice(0,2).join(" ")}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Revenue flow */}
        <div className="card">
          <div className="card-title">Revenue Flow — L3 → L2 → L1 → Treasury</div>
          {areData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {[
                { label: "DeFi Fees (24h)", value: usd(Number(defi?.totalFees24hUSD ?? 0)), pct: 30 },
                { label: "Trading PnL",     value: usd(Number(trading?.totalPnlUSD ?? 0)), pct: 40 },
                { label: "SaaS MRR",        value: usd(Number(areData.saas?.totalMRR_USD ?? 0)), pct: 20 },
                { label: "Compute Revenue", value: usd(Number((areData.marketplace?.totalRevenueGST ?? 0) * Number(treasury?.gstPriceUSD ?? 2.84))), pct: 10 },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex-between" style={{ fontSize: "0.78rem", marginBottom: "0.2rem" }}>
                    <span>{row.label}</span>
                    <span style={{ fontWeight: 600 }}>{row.value}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${row.pct}%`, background: "var(--accent)" }} />
                  </div>
                </div>
              ))}
              <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Distribution: 40% treasury · 30% validators · 30% ecosystem
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>ARE offline — connect port 9987</div>
          )}
        </div>
      </div>

      {/* ── Chain status ───────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">Blockchain Networks</div>
        <div className="grid grid-3">
          {Object.entries(C3_CONFIG.chains).map(([id, cfg]) => (
            <div key={id} className="chain-card" style={{ borderLeftColor: cfg.color }}>
              <div className="chain-card-header">
                <span className="chain-name">{cfg.name}</span>
                <span className="badge badge-green"><span className="dot" />Online</span>
              </div>
              <div className="chain-metrics">
                <div className="metric"><div className="metric-label">Chain ID</div><div className="metric-value">{cfg.chainId}</div></div>
                <div className="metric"><div className="metric-label">Symbol</div><div className="metric-value">{cfg.symbol}</div></div>
                <div className="metric"><div className="metric-label">L1 Block</div><div className="metric-value">{id === "ghostchain" && blockHeight ? blockHeight.toLocaleString() : "—"}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
