// GhostStack — User Governance Voting
"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Proposal {
  id:           string;
  title:        string;
  description:  string;
  status:       "active" | "passed" | "rejected" | "pending";
  votesFor:     number;
  votesAgainst: number;
  quorum:       number;
  endsAt:       number;
  proposer:     string;
  category:     string;
  userVoted?:   "for" | "against" | null;
}

function timeLeft(ts: number) {
  const diff = ts - Date.now();
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h left` : `${h}h left`;
}

const CATEGORY_ICONS: Record<string, string> = {
  treasury: "💰", upgrade: "🔧", params: "⚙️", governance: "🏛", security: "🛡", economic: "📈",
};

export default function UserGovernancePage() {
  const { data, isLoading, mutate } = useSWR<{ proposals: Proposal[]; stats: Record<string, number> }>(
    "/api/governance/proposals",
    fetcher,
    { refreshInterval: 30_000 },
  );

  const proposals = data?.proposals ?? [];
  const active    = proposals.filter(p => p.status === "active");
  const past      = proposals.filter(p => p.status !== "active");

  return (
    <>
      <div className="page-header">
        <h1>🏛 Governance</h1>
        <p>Vote on GhostChain proposals — stake-weighted, AI-drafted, human-ratified</p>
      </div>

      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <div className="flex gap-1">
          <span className="badge badge-cyan">{active.length} active</span>
          <span className="badge badge-green">{proposals.filter(p=>p.status==="passed").length} passed</span>
        </div>
        <button className="btn btn-ghost" onClick={() => mutate()}>↻ Refresh</button>
      </div>

      {/* Stats */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value">{proposals.length}</div></div>
        <div className="stat-card"><div className="stat-label">Active</div><div className="stat-value text-cyan">{active.length}</div></div>
        <div className="stat-card"><div className="stat-label">Passed</div><div className="stat-value text-green">{proposals.filter(p=>p.status==="passed").length}</div></div>
        <div className="stat-card"><div className="stat-label">Quorum</div><div className="stat-value">67%</div></div>
      </div>

      {/* Active proposals */}
      {active.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div className="section-title" style={{ marginBottom: "0.75rem" }}>Active Proposals — Vote Now</div>
          {active.map(p => {
            const total  = p.votesFor + p.votesAgainst;
            const forPct = total > 0 ? (p.votesFor / total * 100) : 0;
            return (
              <div key={p.id} className="card" style={{ marginBottom: "0.75rem", borderTop: "3px solid var(--cyan)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                      <span style={{ fontSize: "1.1rem" }}>{CATEGORY_ICONS[p.category] ?? "📋"}</span>
                      <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{p.title}</span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{p.description.slice(0, 140)}…</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "1rem" }}>
                    <div className="badge badge-cyan">{timeLeft(p.endsAt)}</div>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>#{p.id}</div>
                  </div>
                </div>

                {/* Vote bar */}
                <div style={{ marginBottom: "0.6rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginBottom: "0.2rem" }}>
                    <span style={{ color: "var(--green)" }}>For {forPct.toFixed(1)}%</span>
                    <span style={{ color: "var(--red)" }}>Against {(100-forPct).toFixed(1)}%</span>
                  </div>
                  <div className="progress-bar" style={{ height: "6px" }}>
                    <div className="progress-fill" style={{ width: `${forPct}%`, background: "var(--green)" }} />
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    Quorum: {p.quorum}% required · {total.toLocaleString()} votes cast
                  </div>
                </div>

                {/* Vote buttons */}
                {p.userVoted ? (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    ✓ You voted <strong style={{ color: p.userVoted === "for" ? "var(--green)" : "var(--red)" }}>{p.userVoted}</strong>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button style={{ flex: 1, padding: "0.5rem", borderRadius: "6px", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", color: "var(--green)", fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}>
                      ✓ Vote For
                    </button>
                    <button style={{ flex: 1, padding: "0.5rem", borderRadius: "6px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--red)", fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}>
                      ✗ Vote Against
                    </button>
                    <button style={{ padding: "0.5rem 0.85rem", borderRadius: "6px", background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.78rem" }}>
                      Abstain
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Past proposals */}
      {past.length > 0 && (
        <div className="card">
          <div className="card-title">Past Proposals</div>
          <table className="data-table">
            <thead><tr><th>#</th><th>Title</th><th>Category</th><th>Status</th><th>For %</th></tr></thead>
            <tbody>
              {past.map(p => {
                const total  = p.votesFor + p.votesAgainst;
                const forPct = total > 0 ? (p.votesFor / total * 100).toFixed(1) : "—";
                return (
                  <tr key={p.id}>
                    <td className="mono" style={{ color: "var(--text-muted)" }}>#{p.id}</td>
                    <td style={{ fontWeight: 600 }}>{p.title}</td>
                    <td><span style={{ fontSize: "0.72rem" }}>{CATEGORY_ICONS[p.category] ?? "📋"} {p.category}</span></td>
                    <td><span className={`badge badge-${p.status === "passed" ? "green" : "red"}`}>{p.status}</span></td>
                    <td className="mono">{forPct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && proposals.length === 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
          No governance proposals found. The governance service may be offline.
        </div>
      )}
    </>
  );
}
