// GhostStack — User Portal Home
"use client";
import useSWR from "swr";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface WalletData {
  address:    string;
  gstBalance: number;
  stakedGST:  number;
  pendingRewards: number;
  usdValue:   number;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n/1_000).toFixed(2)}K`;
  return n.toFixed(4);
}

export default function UserHome() {
  const { data: wallet } = useSWR<WalletData>("/api/user/wallet", fetcher, { refreshInterval: 15_000 });

  return (
    <>
      <div className="page-header">
        <h1>🏠 Welcome to GhostWallet</h1>
        <p>Your unified portal to GhostChain — wallet, staking, governance, and cross-chain bridge</p>
      </div>

      {/* Balance summary */}
      <div className="wallet-card" style={{ marginBottom: "1.5rem" }}>
        <div className="wallet-balance-label">Total Portfolio (GST)</div>
        <div className="wallet-balance">
          {wallet ? fmt((wallet.gstBalance ?? 0) + (wallet.stakedGST ?? 0)) : "—"} GST
        </div>
        {wallet && <div className="wallet-address">≈ ${((wallet.gstBalance + wallet.stakedGST)).toFixed(2)} USD</div>}
        {wallet?.address && (
          <div className="wallet-address" style={{ marginTop: "0.25rem" }}>
            {wallet.address.slice(0, 8)}…{wallet.address.slice(-6)}
          </div>
        )}
        <div className="wallet-actions">
          <Link href="/user/wallet" className="wallet-btn wallet-btn-primary">💳 Wallet</Link>
          <Link href="/user/staking" className="wallet-btn wallet-btn-secondary">🔒 Stake GST</Link>
          <Link href="/user/bridge" className="wallet-btn wallet-btn-secondary">🌉 Bridge</Link>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-3" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card">
          <div className="stat-label">Available GST</div>
          <div className="stat-value" style={{ color: "var(--user-accent)" }}>{wallet ? fmt(wallet.gstBalance) : "—"}</div>
          <div className="stat-detail">in wallet</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Staked GST</div>
          <div className="stat-value text-green">{wallet ? fmt(wallet.stakedGST) : "—"}</div>
          <div className="stat-detail">earning rewards</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Rewards</div>
          <div className="stat-value text-yellow">{wallet ? fmt(wallet.pendingRewards) : "—"}</div>
          <div className="stat-detail">claimable now</div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">Quick Actions</div>
          <div className="action-grid">
            {[
              { href: "/user/wallet",       icon: "💳", label: "View Wallet",        desc: "Check balances and send GST" },
              { href: "/user/staking",      icon: "🔒", label: "Stake GST",          desc: "Delegate to validators, earn rewards" },
              { href: "/user/governance",   icon: "🏛", label: "Vote on Proposals",  desc: "Participate in GhostChain governance" },
              { href: "/user/bridge",       icon: "🌉", label: "Cross-Chain Bridge", desc: "Move GST between L1, L2, and L3" },
              { href: "/user/transactions", icon: "📋", label: "Transactions",       desc: "Full history across all chains" },
              { href: "/docs/whitepaper",   icon: "📄", label: "Read Whitepaper",    desc: "GhostChain technical architecture" },
            ].map(a => (
              <Link key={a.href} href={a.href} className="action-card" style={{ textDecoration: "none" }}>
                <div style={{ fontSize: "1.4rem" }}>{a.icon}</div>
                <div className="action-card-title">{a.label}</div>
                <div className="action-card-desc">{a.desc}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">GhostChain Status</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {[
              { label: "GhostChain L1", id: "14000101", color: "#7c3aed" },
              { label: "GhostL2 (OP)", id: "901",       color: "#10b981" },
              { label: "GhostL3 (OP)", id: "903",       color: "#f59e0b" },
            ].map(c => (
              <div key={c.label} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.85rem", background: "var(--surface-2)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.color, boxShadow: `0 0 5px ${c.color}`, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{c.label}</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "monospace", marginLeft: "auto" }}>chain {c.id}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "1rem" }}>
            <Link href="/dashboard/overview" style={{ fontSize: "0.78rem", color: "var(--user-accent)", textDecoration: "none" }}>
              → View full system status (C3)
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
