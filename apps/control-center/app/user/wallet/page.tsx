// GhostStack — User Wallet
"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface WalletData {
  address:    string;
  gstBalance: number;
  stakedGST:  number;
  pendingRewards: number;
  usdValue:   number;
  tokens: Array<{ symbol: string; name: string; balance: number; usdValue: number; icon: string; chain: string }>;
}

function fmt(n: number, dp = 4) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n/1_000).toFixed(2)}K`;
  return n.toFixed(dp);
}

export default function WalletPage() {
  const { data, isLoading, mutate } = useSWR<WalletData>("/api/user/wallet", fetcher, { refreshInterval: 15_000 });

  return (
    <>
      <div className="page-header">
        <h1>💳 GhostWallet</h1>
        <p>Your GST balances, portfolio, and transaction actions across GhostChain L1, L2, and L3</p>
      </div>

      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <span className="badge badge-cyan">💼 Connected</span>
        <button className="btn btn-ghost" onClick={() => mutate()}>↻ Refresh</button>
      </div>

      {/* Main wallet card */}
      <div className="wallet-card" style={{ marginBottom: "1.5rem" }}>
        <div className="wallet-balance-label">Total GST Balance</div>
        <div className="wallet-balance">
          {data ? fmt(data.gstBalance) : (isLoading ? "…" : "—")} GST
        </div>
        <div className="wallet-address">
          ≈ ${data ? data.usdValue.toFixed(2) : "—"} USD
        </div>
        {data?.address && (
          <div className="wallet-address" style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>{data.address}</span>
            <button
              onClick={() => navigator.clipboard.writeText(data.address)}
              style={{ background: "none", border: "none", color: "var(--user-accent)", cursor: "pointer", fontSize: "0.8rem" }}
            >📋</button>
          </div>
        )}
        <div className="wallet-actions">
          <button className="wallet-btn wallet-btn-primary">📤 Send</button>
          <button className="wallet-btn wallet-btn-secondary">📥 Receive</button>
          <button className="wallet-btn wallet-btn-secondary">🔄 Swap on GhostXchange</button>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card">
          <div className="stat-label">Available</div>
          <div className="stat-value" style={{ color: "var(--user-accent)" }}>{data ? fmt(data.gstBalance) : "—"}</div>
          <div className="stat-detail">GST · liquid</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Staked</div>
          <div className="stat-value text-green">{data ? fmt(data.stakedGST) : "—"}</div>
          <div className="stat-detail">GST · earning rewards</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Rewards</div>
          <div className="stat-value text-yellow">{data ? fmt(data.pendingRewards) : "—"}</div>
          <div className="stat-detail">GST · claimable</div>
        </div>
      </div>

      {/* Token list */}
      <div className="card">
        <div className="section-header">
          <span className="section-title">Token Balances</span>
        </div>
        <div className="token-list">
          {/* Native GST always first */}
          <div className="token-row">
            <div className="token-info">
              <div className="token-icon">👻</div>
              <div>
                <div className="token-name">GhostStack Token</div>
                <div className="token-symbol">GST · Native</div>
              </div>
            </div>
            <div className="token-amounts">
              <div className="token-balance">{data ? fmt(data.gstBalance) : "—"} GST</div>
              <div className="token-usd">${data ? data.usdValue.toFixed(2) : "—"}</div>
            </div>
          </div>

          {(data?.tokens ?? []).map((t, i) => (
            <div key={i} className="token-row">
              <div className="token-info">
                <div className="token-icon">{t.icon}</div>
                <div>
                  <div className="token-name">{t.name}</div>
                  <div className="token-symbol">{t.symbol} · {t.chain}</div>
                </div>
              </div>
              <div className="token-amounts">
                <div className="token-balance">{fmt(t.balance)} {t.symbol}</div>
                <div className="token-usd">${t.usdValue.toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
