// GhostStack C3 — GST Token Stats
"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface TokenStats {
  symbol:          string;
  name:            string;
  priceUSD:        number;
  priceChange24h:  number;
  marketCapUSD:    number;
  totalSupply:     number;
  circulatingSupply: number;
  stakedSupply:    number;
  burnedAllTime:   number;
  txCount24h:      number;
  holdersCount:    number;
  l1Balance:       number;
  l2Balance:       number;
  l3Balance:       number;
  gstUnitWei:      string;
  canonicalAddress: string;
}

function fmt(n: number) {
  if (n >= 1_000_000_000) return `${(n/1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${(n/1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

export default function TokensPage() {
  const { data, isLoading, mutate } = useSWR<TokenStats>(
    "/api/tokens/stats",
    fetcher,
    { refreshInterval: 20_000 },
  );

  const priceUp = (data?.priceChange24h ?? 0) >= 0;

  return (
    <>
      <div className="page-header">
        <h1>🪙 GST Token</h1>
        <p>GhostChain native gas token — supply, staking, burn, and cross-chain balance stats</p>
      </div>

      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <div className="flex gap-1">
          <span className="badge badge-purple">GST · Native Token</span>
          <span className="badge badge-gray">GhostChain L1/L2/L3</span>
        </div>
        <button className="btn btn-ghost" onClick={() => mutate()}>↻ Refresh</button>
      </div>

      {/* Price banner */}
      <div className="card" style={{ marginBottom: "1.5rem", background: "linear-gradient(135deg, #0f1117 0%, #1a1040 100%)", borderColor: "rgba(124,58,237,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "2rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "0.3rem" }}>GST Price (USD)</div>
            <div style={{ fontSize: "2.8rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
              {data ? `$${data.priceUSD.toFixed(4)}` : "—"}
            </div>
            {data && (
              <div style={{ fontSize: "0.88rem", color: priceUp ? "var(--green)" : "var(--red)", marginTop: "0.2rem" }}>
                {priceUp ? "▲" : "▼"} {Math.abs(data.priceChange24h).toFixed(2)}% (24h)
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div><div className="stat-label">Market Cap</div><div style={{ fontWeight: 700 }}>{data ? `$${fmt(data.marketCapUSD)}` : "—"}</div></div>
              <div><div className="stat-label">Total Supply</div><div style={{ fontWeight: 700 }}>{data ? fmt(data.totalSupply) : "—"} GST</div></div>
              <div><div className="stat-label">Circulating</div><div style={{ fontWeight: 700 }}>{data ? fmt(data.circulatingSupply) : "—"} GST</div></div>
              <div><div className="stat-label">Staked</div><div style={{ fontWeight: 700, color: "var(--green)" }}>{data ? `${((data.stakedSupply/data.totalSupply)*100).toFixed(1)}%` : "—"}</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: "1.5rem" }}>

        {/* Supply breakdown */}
        <div className="card">
          <div className="card-title">Supply Breakdown</div>
          <div className="info-grid">
            <div className="info-row"><span className="info-label">Total Supply</span><span className="info-value">{data ? fmt(data.totalSupply) : "—"} GST</span></div>
            <div className="info-row"><span className="info-label">Circulating</span><span className="info-value">{data ? fmt(data.circulatingSupply) : "—"} GST</span></div>
            <div className="info-row"><span className="info-label">Staked</span><span className="info-value text-green">{data ? fmt(data.stakedSupply) : "—"} GST</span></div>
            <div className="info-row"><span className="info-label">Burned All-Time</span><span className="info-value text-red">{data ? fmt(data.burnedAllTime) : "—"} GST</span></div>
            <div className="info-row"><span className="info-label">GST Unit (wei)</span><span className="info-value mono" style={{ fontSize: "0.72rem" }}>{data?.gstUnitWei ?? "1e18"}</span></div>
            <div className="info-row"><span className="info-label">Canonical Address</span><span className="info-value mono" style={{ fontSize: "0.68rem", color: "var(--cyan)" }}>{data?.canonicalAddress ?? "—"}</span></div>
          </div>
        </div>

        {/* Activity */}
        <div className="card">
          <div className="card-title">Activity &amp; Holders</div>
          <div className="info-grid">
            <div className="info-row"><span className="info-label">Tx Count 24h</span><span className="info-value">{data ? data.txCount24h.toLocaleString() : "—"}</span></div>
            <div className="info-row"><span className="info-label">Holder Count</span><span className="info-value">{data ? data.holdersCount.toLocaleString() : "—"}</span></div>
            <div className="info-row"><span className="info-label">Staking Rate</span><span className="info-value text-green">{data ? `${((data.stakedSupply/data.totalSupply)*100).toFixed(1)}%` : "—"}</span></div>
            <div className="info-row"><span className="info-label">Burn Rate (30d)</span><span className="info-value text-yellow">{data ? `${(data.burnedAllTime/data.totalSupply*100).toFixed(2)}%` : "—"}</span></div>
          </div>
        </div>
      </div>

      {/* Cross-chain balances */}
      <div className="card">
        <div className="card-title">Cross-Chain GST Distribution</div>
        {[
          { label: "GhostChain L1", chain: "L1", id: 14000101, val: data?.l1Balance, color: "#7c3aed" },
          { label: "GhostL2",       chain: "L2", id: 901,      val: data?.l2Balance, color: "#10b981" },
          { label: "GhostL3",       chain: "L3", id: 903,      val: data?.l3Balance, color: "#f59e0b" },
        ].map(row => {
          const total = (data?.l1Balance ?? 0) + (data?.l2Balance ?? 0) + (data?.l3Balance ?? 0);
          const pct = total > 0 && row.val ? ((row.val / total) * 100).toFixed(1) : "0";
          return (
            <div key={row.label} style={{ marginBottom: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem", fontSize: "0.82rem" }}>
                <span style={{ fontWeight: 600 }}>{row.label} <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>chain {row.id}</span></span>
                <span style={{ fontWeight: 700 }}>{row.val ? fmt(row.val) : "—"} GST <span style={{ color: "var(--text-muted)" }}>({pct}%)</span></span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%`, background: row.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
