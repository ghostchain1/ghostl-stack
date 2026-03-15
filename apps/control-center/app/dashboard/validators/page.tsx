"use client";
import { useValidators } from "@/hooks/useChains";
import { ValidatorTable } from "@/components/tables/ValidatorTable";

export default function ValidatorsPage() {
  const { validators, isLoading, isError, refresh } = useValidators();

  const active    = validators.filter(v => v.status === "active").length;
  const jailed    = validators.filter(v => v.status === "jailed").length;
  const unbonding = validators.filter(v => v.status === "unbonding").length;
  const avgUptime = validators.length
    ? (validators.reduce((s, v) => s + v.uptimePct, 0) / validators.length).toFixed(2)
    : "—";
  const totalVP = validators.reduce((s, v) => s + v.votingPower, 0);

  return (
    <>
      <div className="page-header">
        <h1>🗳 Validators</h1>
        <p>Stake, uptime, and reward data fetched from the Autonomous Revenue Engine (port 9987)</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value text-green">{isLoading ? "…" : active}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Jailed</div>
          <div className="stat-value text-red">{isLoading ? "…" : jailed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Uptime</div>
          <div className="stat-value">{isLoading ? "…" : `${avgUptime}%`}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Voting Power</div>
          <div className="stat-value">{isLoading ? "…" : totalVP.toLocaleString()}</div>
        </div>
      </div>

      {/* Status filter row */}
      <div className="flex-between" style={{ marginBottom: "0.75rem" }}>
        <div className="flex gap-1">
          <span className="badge badge-green">{active} active</span>
          {jailed    > 0 && <span className="badge badge-red">{jailed} jailed</span>}
          {unbonding > 0 && <span className="badge badge-yellow">{unbonding} unbonding</span>}
          {isError && <span className="badge badge-red">ARE offline</span>}
        </div>
        <button className="btn btn-ghost" onClick={() => refresh()}>↻ Refresh</button>
      </div>

      {/* Validator table */}
      <div className="card">
        <div className="card-title">Validator Set</div>
        {isLoading
          ? <div style={{ color: "var(--text-muted)", padding: "1rem" }}>Loading validators…</div>
          : <ValidatorTable validators={validators} />
        }
      </div>
    </>
  );
}
