"use client";
import useSWR from "swr";
import { C3_CONFIG } from "@/config/ghostConfig";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Proposal {
  id:          string;
  title:       string;
  description: string;
  status:      "active" | "passed" | "rejected" | "pending";
  votesFor:    number;
  votesAgainst:number;
  quorum:      number;
  endsAt:      number;
  proposer:    string;
  category:    string;
}

interface GovernanceData {
  proposals: Proposal[];
  stats: {
    total:          number;
    active:         number;
    passed:         number;
    rejected:       number;
    quorumThreshold:number;
  };
}

const STATUS_BADGE: Record<string, string> = {
  active:   "badge-cyan",
  passed:   "badge-green",
  rejected: "badge-red",
  pending:  "badge-yellow",
};

export default function GovernancePage() {
  const { data, isLoading, mutate } = useSWR<GovernanceData>(
    "/api/governance/proposals",
    fetcher,
    { refreshInterval: C3_CONFIG.refreshIntervals.governance },
  );

  const stats     = data?.stats;
  const proposals = data?.proposals ?? [];

  return (
    <>
      <div className="page-header">
        <h1>🏛 Governance</h1>
        <p>Proposals, votes, and treasury allocations managed by the Governance Impact Engine (port 9975)</p>
      </div>

      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <div className="flex gap-1">
          <span className="badge badge-cyan">{stats?.active ?? 0} active</span>
          <span className="badge badge-green">{stats?.passed ?? 0} passed</span>
          <span className="badge badge-red">{stats?.rejected ?? 0} rejected</span>
        </div>
        <button className="btn btn-ghost" onClick={() => mutate()}>↻ Refresh</button>
      </div>

      {/* KPI row */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card"><div className="stat-label">Total Proposals</div><div className="stat-value">{stats?.total ?? "—"}</div></div>
        <div className="stat-card"><div className="stat-label">Active Votes</div><div className="stat-value text-cyan">{stats?.active ?? "—"}</div></div>
        <div className="stat-card"><div className="stat-label">Pass Rate</div><div className="stat-value text-green">{stats && stats.total > 0 ? `${((stats.passed / stats.total) * 100).toFixed(0)}%` : "—"}</div></div>
        <div className="stat-card"><div className="stat-label">Quorum Required</div><div className="stat-value">{stats?.quorumThreshold ?? 67}%</div></div>
      </div>

      {/* GIE offline notice */}
      {!isLoading && proposals.length === 0 && (
        <div className="card" style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
          Governance Impact Engine (GIE) is offline or has no proposals. Start with{" "}
          <span className="mono">make gie-dev</span>
        </div>
      )}

      {/* Proposals */}
      {proposals.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {proposals.map(p => {
            const total   = p.votesFor + p.votesAgainst;
            const forPct  = total > 0 ? (p.votesFor    / total * 100) : 0;
            const agPct   = total > 0 ? (p.votesAgainst / total * 100) : 0;
            const passPct = (p.votesFor / (p.quorum || 1)) * 100;
            return (
              <div key={p.id} className="card">
                <div className="flex-between" style={{ marginBottom: "0.5rem" }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: "0.2rem" }}>{p.title}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {p.category} · Proposed by <span className="mono">{p.proposer?.slice(0,10)}…</span>
                    </div>
                  </div>
                  <span className={`badge ${STATUS_BADGE[p.status] ?? "badge-gray"}`}>{p.status}</span>
                </div>
                {p.description && <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>{p.description}</div>}
                <div className="grid grid-2" style={{ gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <div>
                    <div style={{ fontSize: "0.72rem", color: "#10b981", marginBottom: "0.2rem" }}>For: {p.votesFor?.toLocaleString()} ({forPct.toFixed(1)}%)</div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${forPct}%`, background: "#10b981" }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.72rem", color: "#ef4444", marginBottom: "0.2rem" }}>Against: {p.votesAgainst?.toLocaleString()} ({agPct.toFixed(1)}%)</div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${agPct}%`, background: "#ef4444" }} />
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  Quorum: {passPct.toFixed(1)}% of required · Ends: {p.endsAt ? new Date(p.endsAt).toLocaleDateString() : "—"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
