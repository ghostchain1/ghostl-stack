// GhostStack — User Staking
"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Delegation {
  validatorAddress: string;
  moniker:         string;
  delegated:       number;
  pendingRewards:  number;
  apr:             number;
  commission:      number;
  status:          "active" | "jailed" | "unbonding";
  uptimePct:       number;
}

interface StakingData {
  totalStaked:       number;
  totalRewards:      number;
  unbondingPeriodDays: number;
  delegations:       Delegation[];
  availableGST:      number;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n/1_000).toFixed(2)}K`;
  return n.toFixed(4);
}

export default function StakingPage() {
  const { data, isLoading, mutate } = useSWR<StakingData>("/api/user/staking", fetcher, { refreshInterval: 20_000 });

  const delegations = data?.delegations ?? [];

  return (
    <>
      <div className="page-header">
        <h1>🔒 Staking</h1>
        <p>Delegate GST to validators, earn staking rewards, and manage unbonding — GhostChain L1</p>
      </div>

      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <div className="flex gap-1">
          <span className="badge badge-green">{delegations.filter(d=>d.status==="active").length} active delegations</span>
          {delegations.filter(d=>d.status==="unbonding").length > 0 && (
            <span className="badge badge-yellow">{delegations.filter(d=>d.status==="unbonding").length} unbonding</span>
          )}
        </div>
        <button className="btn btn-ghost" onClick={() => mutate()}>↻ Refresh</button>
      </div>

      {/* Summary */}
      <div className="grid grid-3" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card">
          <div className="stat-label">Total Staked</div>
          <div className="stat-value text-green">{data ? fmt(data.totalStaked) : "—"} GST</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Rewards</div>
          <div className="stat-value text-yellow">{data ? fmt(data.totalRewards) : "—"} GST</div>
          <div className="stat-detail">
            <button className="btn-mini">Claim All</button>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unbonding Period</div>
          <div className="stat-value">{data?.unbondingPeriodDays ?? 21} days</div>
        </div>
      </div>

      {/* Delegation cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "1.5rem" }}>
        <div className="section-title">Your Delegations</div>
        {isLoading && <div style={{ color: "var(--text-muted)" }}>Loading delegations…</div>}
        {delegations.map((d, i) => (
          <div key={i} className="stake-card">
            <div className="stake-validator">
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem", fontWeight: 700, flexShrink: 0 }}>
                {d.moniker.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="stake-moniker">{d.moniker}</div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span className="stake-apr">APR {d.apr.toFixed(1)}%</span>
                  <span className={`badge badge-${d.status === "active" ? "green" : d.status === "jailed" ? "red" : "yellow"}`} style={{ fontSize: "0.62rem" }}>{d.status}</span>
                </div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <button className="btn-mini" style={{ marginRight: "0.4rem" }}>+ Delegate</button>
                <button className="btn btn-ghost" style={{ fontSize: "0.68rem", padding: "0.2rem 0.5rem" }}>Undelegate</button>
              </div>
            </div>
            <div className="stake-bar-outer">
              <div className="stake-bar-fill" style={{ width: `${d.uptimePct}%` }} />
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
              {d.uptimePct}% uptime · Commission {d.commission}%
            </div>
            <div className="stake-meta">
              <span><strong>{fmt(d.delegated)} GST</strong>delegated</span>
              <span><strong style={{ color: "var(--yellow)" }}>{fmt(d.pendingRewards)} GST</strong>pending</span>
              <span><strong>{d.validatorAddress.slice(0,6)}…{d.validatorAddress.slice(-4)}</strong>address</span>
            </div>
          </div>
        ))}
        {!isLoading && delegations.length === 0 && (
          <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
            No active delegations. Connect your wallet and delegate GST to start earning rewards.
          </div>
        )}
      </div>

      {/* New delegation form */}
      <div className="card">
        <div className="card-title">New Delegation</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div>
            <div className="bridge-input-label">Validator Address</div>
            <input type="text" className="bridge-input" placeholder="ghost1abc…" />
          </div>
          <div>
            <div className="bridge-input-label">Amount (GST)</div>
            <input type="number" className="bridge-input" placeholder="100" min="1" />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="bridge-submit" style={{ margin: 0 }}>Delegate GST</button>
          </div>
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Available: {data ? fmt(data.availableGST) : "—"} GST · Unbonding period: {data?.unbondingPeriodDays ?? 21} days
        </div>
      </div>
    </>
  );
}
