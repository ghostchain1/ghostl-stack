import { fetchGovernanceProposals } from "../../lib/api";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  draft:               "var(--text-muted)",
  simulation_pending:  "var(--yellow)",
  simulation_passed:   "var(--green)",
  simulation_failed:   "var(--red)",
  voting:              "var(--accent)",
  approved:            "var(--green)",
  rejected:            "var(--red)",
  executed:            "var(--green)",
  failed:              "var(--red)",
};

export default async function GovernancePage() {
  const data = await fetchGovernanceProposals();
  const proposals: Array<Record<string, unknown>> = data?.proposals ?? [];

  const byStatus = proposals.reduce<Record<string, number>>((acc, p) => {
    const s = String(p.status);
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <div className="page-header">
        <h1>Governance</h1>
        <p>AI-proposed → SimLab-validated → on-chain voted → SCP-executed</p>
      </div>

      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        {Object.entries(byStatus).map(([status, count]) => (
          <div className="card" key={status}>
            <div className="card-title">{status.replace(/_/g, " ")}</div>
            <div className="card-value" style={{ color: STATUS_COLORS[status] ?? "var(--text)" }}>
              {count}
            </div>
          </div>
        ))}
        {proposals.length === 0 && (
          <div className="card" style={{ gridColumn: "1/-1" }}>
            <p style={{ color: "var(--text-muted)" }}>No proposals yet — submit via POST /governance/proposals</p>
          </div>
        )}
      </div>

      {proposals.length > 0 && (
        <div className="card">
          <div className="card-title">All Proposals</div>
          <table className="service-table">
            <thead>
              <tr>
                <th>ID</th><th>Category</th><th>Title</th><th>Status</th><th>Proposed By</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map(p => (
                <tr key={String(p.id)}>
                  <td style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
                    {String(p.id).slice(0, 12)}…
                  </td>
                  <td>{String(p.category)}</td>
                  <td>{String(p.title)}</td>
                  <td>
                    <span style={{ color: STATUS_COLORS[String(p.status)] ?? "var(--text)" }}>
                      {String(p.status).replace(/_/g, " ")}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>{String(p.proposedBy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
