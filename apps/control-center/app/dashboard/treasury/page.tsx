// GhostStack C3 — Treasury page (Server Component — direct ARE call)

import { C3_CONFIG } from "@/config/ghostConfig";

export const dynamic = "force-dynamic";

function usd(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

async function getTreasuryData() {
  try {
    const [balRes, distRes] = await Promise.all([
      fetch(`${C3_CONFIG.engines.are.url}/treasury/balance`,        { signal: AbortSignal.timeout(4_000), cache: "no-store" }),
      fetch(`${C3_CONFIG.engines.are.url}/treasury/distributions`,  { signal: AbortSignal.timeout(4_000), cache: "no-store" }),
    ]);
    return {
      balance:       balRes.ok  ? await balRes.json()  as Record<string, unknown> : null,
      distributions: distRes.ok ? await distRes.json() as Record<string, unknown>[] : [],
    };
  } catch {
    return { balance: null, distributions: [] };
  }
}

export default async function TreasuryPage() {
  const { balance, distributions } = await getTreasuryData();
  const reserves = balance?.reserves as Record<string, number> | null;

  const splitRows = [
    { label: "Treasury Reserve",     pct: 40, color: "#7c3aed" },
    { label: "Validator Rewards",    pct: 30, color: "#10b981" },
    { label: "Ecosystem Incentives", pct: 30, color: "#f59e0b" },
  ];

  return (
    <>
      <div className="page-header">
        <h1>🏦 Treasury</h1>
        <p>GhostStack treasury balance, reserve buckets, and distribution history — ARE port 9987</p>
      </div>

      {!balance && (
        <div className="card" style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
          ARE offline — treasury data unavailable. Start with <span className="mono">make are-dev</span>
        </div>
      )}

      {/* Top KPIs */}
      {balance && (
        <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
          <div className="stat-card">
            <div className="stat-label">Total Treasury USD</div>
            <div className="stat-value text-accent">{usd(Number(balance.totalUSD))}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total GST Held</div>
            <div className="stat-value">{(Number(balance.totalGST) / 1_000).toFixed(1)}K GST</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">GST Price</div>
            <div className="stat-value text-green">${Number(balance.gstPriceUSD).toFixed(4)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Auto-Distribute At</div>
            <div className="stat-value">{usd(C3_CONFIG.treasury.autoDistributeThresholdUSD)}</div>
          </div>
        </div>
      )}

      <div className="grid grid-2" style={{ marginBottom: "1.5rem" }}>
        {/* Distribution split */}
        <div className="card">
          <div className="card-title">Revenue Distribution Split</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "0.5rem" }}>
            {splitRows.map(row => (
              <div key={row.label}>
                <div className="flex-between" style={{ fontSize: "0.82rem", marginBottom: "0.4rem" }}>
                  <span>{row.label}</span>
                  <span style={{ fontWeight: 700, color: row.color }}>{row.pct}%</span>
                </div>
                <div className="progress-bar" style={{ height: 8 }}>
                  <div className="progress-fill" style={{ width: `${row.pct}%`, background: row.color }} />
                </div>
              </div>
            ))}
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Triggered automatically when accumulated revenue reaches ${usd(C3_CONFIG.treasury.autoDistributeThresholdUSD)}
            </div>
          </div>
        </div>

        {/* Reserve buckets */}
        <div className="card">
          <div className="card-title">Reserve Buckets</div>
          {reserves ? (
            <table className="data-table">
              <thead><tr><th>Bucket</th><th style={{ textAlign: "right" }}>USD</th><th style={{ textAlign: "right" }}>Share</th></tr></thead>
              <tbody>
                {Object.entries(reserves).map(([k, v]) => {
                  const total = Object.values(reserves).reduce((a, b) => a + b, 0);
                  const pct   = ((v / total) * 100).toFixed(1);
                  return (
                    <tr key={k}>
                      <td style={{ textTransform: "capitalize" }}>{k}</td>
                      <td style={{ textAlign: "right" }}>{usd(v)}</td>
                      <td style={{ textAlign: "right" }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>No data</div>}
        </div>
      </div>

      {/* Distribution history */}
      <div className="card">
        <div className="card-title">Distribution History</div>
        {distributions.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Treasury (40%)</th>
                <th style={{ textAlign: "right" }}>Validators (30%)</th>
                <th style={{ textAlign: "right" }}>Ecosystem (30%)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {distributions.slice(0, 20).map((d, i) => {
                const ts  = new Date(Number(d.timestamp) || 0).toLocaleString();
                const total = Number(d.totalUSD);
                const t40   = total * 0.4;
                const t30v  = total * 0.3;
                const t30e  = total * 0.3;
                return (
                  <tr key={i}>
                    <td className="mono" style={{ fontSize: "0.75rem" }}>{ts}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{usd(total)}</td>
                    <td style={{ textAlign: "right" }}>{usd(t40)}</td>
                    <td style={{ textAlign: "right" }}>{usd(t30v)}</td>
                    <td style={{ textAlign: "right" }}>{usd(t30e)}</td>
                    <td><span className="badge badge-green">{String(d.status ?? "complete")}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            No distributions yet. Revenue accumulates until the ${usd(C3_CONFIG.treasury.autoDistributeThresholdUSD)} threshold is reached.
          </div>
        )}
      </div>
    </>
  );
}
