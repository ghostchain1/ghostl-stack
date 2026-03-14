import {
  fetchAgeProposals,
  fetchAgeSimulations,
  fetchAgeVotingPredictions,
  fetchAgeExecutionLog,
  fetchAgeDAOs,
  fetchAgeSummary,
  type AgeProposal,
  type AgePolicySimulation,
  type AgeVotingPrediction,
  type AgeExecutionRecord,
  type AgeDAO,
} from "../../lib/api";

export const revalidate = 30;

// ── Colour helpers ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  draft:               "var(--text-muted)",
  "pending-simulation":"var(--yellow)",
  simulated:           "var(--accent)",
  submitted:           "var(--accent)",
  voting:              "var(--yellow)",
  approved:            "var(--green)",
  rejected:            "var(--red)",
  executed:            "var(--green)",
  cancelled:           "var(--text-muted)",
};

const RISK_COLOR: Record<string, string> = {
  low:      "var(--green)",
  medium:   "var(--yellow)",
  high:     "var(--red)",
  critical: "#ff3a3a",
};

const REC_COLOR: Record<string, string> = {
  approve: "var(--green)",
  modify:  "var(--yellow)",
  defer:   "var(--yellow)",
  reject:  "var(--red)",
};

const OUTCOME_COLOR: Record<string, string> = {
  pass:      "var(--green)",
  fail:      "var(--red)",
  uncertain: "var(--yellow)",
};

function fmt(n: number | undefined | null, digits = 1): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(digits)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(digits)}K`;
  return n.toFixed(digits);
}
function fmtPct(n: number | undefined | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function GovernancePage() {
  const [summary, proposals, simulations, predictions, execLog, daos] = await Promise.all([
    fetchAgeSummary(),
    fetchAgeProposals({ limit: 50 }),
    fetchAgeSimulations(),
    fetchAgeVotingPredictions(),
    fetchAgeExecutionLog(10),
    fetchAgeDAOs(),
  ]);

  const propList: AgeProposal[]           = proposals    ?? [];
  const simList:  AgePolicySimulation[]   = simulations  ?? [];
  const predList: AgeVotingPrediction[]   = predictions  ?? [];
  const execList: AgeExecutionRecord[]    = execLog       ?? [];
  const daoList:  AgeDAO[]               = daos          ?? [];

  const active  = propList.filter((p) => ["draft","pending-simulation","simulated","submitted","voting"].includes(p.status));
  const totalTreasury = daoList.reduce((s, d) => s + d.treasuryUSD, 0);
  const registered = summary?.voting?.registeredVoters ?? 250;

  return (
    <>
      <div className="page-header">
        <h1>Autonomous Governance Engine</h1>
        <p>AI-proposed → SimLab-validated → on-chain voted → SCP-executed · port 9978</p>
      </div>

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">Total Proposals</div>
          <div className="card-value">{propList.length || summary?.proposals?.total ?? 0}</div>
        </div>
        <div className="card">
          <div className="card-title">Active Proposals</div>
          <div className="card-value" style={{ color: "var(--accent)" }}>{active.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Treasury Controlled</div>
          <div className="card-value" style={{ color: "var(--green)" }}>{fmt(totalTreasury)}</div>
        </div>
        <div className="card">
          <div className="card-title">Registered Voters</div>
          <div className="card-value">{registered.toLocaleString()}</div>
        </div>
      </div>

      {/* ── Proposals table ──────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">Governance Proposals</div>
        {propList.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No proposals yet — AGE-Gov generates one every 5 minutes.</p>
        ) : (
          <table className="service-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Title</th>
                <th>DAO</th>
                <th>Status</th>
                <th>AI Confidence</th>
                <th>Impact</th>
              </tr>
            </thead>
            <tbody>
              {propList.map((p) => (
                <tr key={p.id}>
                  <td style={{ color: "var(--text-muted)", textTransform: "capitalize" }}>{p.category}</td>
                  <td style={{ maxWidth: "320px" }}>{p.title}</td>
                  <td style={{ color: "var(--accent)", fontSize: "0.8rem" }}>{p.targetDAO}</td>
                  <td>
                    <span style={{ color: STATUS_COLOR[p.status] ?? "var(--text)", textTransform: "capitalize" }}>
                      {p.status.replace(/-/g, " ")}
                    </span>
                  </td>
                  <td>{fmtPct(p.aiConfidence)}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{p.estimatedImpact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Policy simulations ───────────────────────────────────────────── */}
      <div className="grid grid-2" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">Policy Simulations</div>
          {simList.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No simulations yet.</p>
          ) : (
            <table className="service-table">
              <thead>
                <tr><th>Proposal</th><th>ROI</th><th>Risk</th><th>Recommendation</th></tr>
              </thead>
              <tbody>
                {simList.slice(0, 8).map((s) => {
                  const prop = propList.find((p) => p.id === s.proposalId);
                  return (
                    <tr key={s.proposalId}>
                      <td style={{ fontSize: "0.8rem", maxWidth: "200px" }}>
                        {prop?.title ?? s.proposalId.slice(0, 12) + "…"}
                      </td>
                      <td style={{ color: s.treasuryROI >= 1 ? "var(--green)" : "var(--red)" }}>
                        {s.treasuryROI.toFixed(2)}×
                      </td>
                      <td>
                        <span style={{ color: RISK_COLOR[s.riskLevel] ?? "var(--text)", textTransform: "capitalize" }}>
                          {s.riskLevel}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: REC_COLOR[s.recommendation] ?? "var(--text)", textTransform: "capitalize" }}>
                          {s.recommendation}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Voting predictions ──────────────────────────────────────────── */}
        <div className="card">
          <div className="card-title">Voting Predictions</div>
          {predList.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No predictions yet.</p>
          ) : (
            <table className="service-table">
              <thead>
                <tr><th>Proposal</th><th>Weighted Yes</th><th>Outcome</th><th>Confidence</th></tr>
              </thead>
              <tbody>
                {predList.slice(0, 8).map((pred) => {
                  const prop = propList.find((p) => p.id === pred.proposalId);
                  return (
                    <tr key={pred.proposalId}>
                      <td style={{ fontSize: "0.8rem", maxWidth: "200px" }}>
                        {prop?.title ?? pred.proposalId.slice(0, 12) + "…"}
                      </td>
                      <td>{fmtPct(pred.weightedYesPct)}</td>
                      <td>
                        <span style={{ color: OUTCOME_COLOR[pred.likelyOutcome] ?? "var(--text)", textTransform: "capitalize" }}>
                          {pred.likelyOutcome}
                        </span>
                      </td>
                      <td>{fmtPct(pred.confidenceScore)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Execution log ────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">Execution Log</div>
        {execList.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No executions yet — approved proposals are executed automatically.</p>
        ) : (
          <table className="service-table">
            <thead>
              <tr><th>Proposal</th><th>Status</th><th>Tx Hash</th><th>Gas Used</th><th>Time</th></tr>
            </thead>
            <tbody>
              {execList.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontSize: "0.8rem" }}>{e.proposalTitle}</td>
                  <td>
                    <span style={{ color: e.status === "success" ? "var(--green)" : e.status === "failed" ? "var(--red)" : "var(--yellow)", textTransform: "capitalize" }}>
                      {e.status}
                    </span>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {e.txHash ? `${e.txHash.slice(0, 14)}…` : "—"}
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>{e.gasUsed?.toLocaleString() ?? "—"}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── DAO Registry ─────────────────────────────────────────────────── */}
      <div className="card-title" style={{ marginBottom: "0.75rem" }}>DAO Registry</div>
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        {daoList.length === 0 ? (
          <div className="card" style={{ gridColumn: "1/-1" }}>
            <p style={{ color: "var(--text-muted)" }}>No DAOs registered yet.</p>
          </div>
        ) : (
          daoList.map((dao) => (
            <div className="card" key={dao.id}>
              <div className="card-title">{dao.name}</div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                {dao.description}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem" }}>
                <div>Treasury: <strong style={{ color: "var(--green)" }}>{fmt(dao.treasuryUSD)}</strong></div>
                <div>Members: <strong>{dao.memberCount.toLocaleString()}</strong></div>
                <div>Proposals: <strong>{dao.totalProposals}</strong> ({dao.executedProposals} executed)</div>
                <div>
                  Status:{" "}
                  <span style={{ color: dao.status === "active" ? "var(--green)" : "var(--text-muted)", textTransform: "capitalize" }}>
                    {dao.status}
                  </span>
                </div>
              </div>
              <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                {dao.tags.slice(0, 3).map((tag) => (
                  <span key={tag} style={{ fontSize: "0.7rem", padding: "2px 6px", background: "var(--bg-3)", borderRadius: "4px", color: "var(--text-muted)" }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

