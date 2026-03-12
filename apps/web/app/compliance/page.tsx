import {
  fetchAcgeHealth,
  fetchAcgeAlerts,
  fetchAcgeProposals,
  fetchAcgeAudit,
  fetchAcgeIdentities,
  fetchAcgeRegulations,
  type AcgeHealth,
  type AcgeComplianceAlert,
  type AcgeProposal,
  type AcgeAuditEvent,
  type AcgeIdentityRecord,
  type AcgeRegulation,
  type KycStatus,
  type AlertSeverity,
  type ProposalStatus,
} from "../../lib/api";

export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

function kycBadge(status: KycStatus) {
  const cls = status === "verified" ? "badge-green"
            : status === "pending"  ? "badge-yellow"
            : "badge-red";
  return <span className={`badge ${cls}`}><span className="dot" />{status}</span>;
}

function severityBadge(sev: AlertSeverity | string) {
  const cls = sev === "critical" ? "badge-red"
            : sev === "high"     ? "badge-yellow"
            : sev === "medium"   ? "badge-yellow"
            : "badge-green";
  return <span className={`badge ${cls}`}><span className="dot" />{sev}</span>;
}

function proposalBadge(status: ProposalStatus | string) {
  const cls = status === "executed" || status === "approved" ? "badge-green"
            : status === "voting"   ? "badge-yellow"
            : status === "rejected" || status === "expired"  ? "badge-red"
            : "badge-green";
  return <span className={`badge ${cls}`}><span className="dot" />{status}</span>;
}

function pct(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function ts(epoch: number): string {
  return new Date(epoch).toLocaleTimeString();
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CompliancePage() {
  const [health, alerts, proposals, auditEvents, identities, regulations] = await Promise.all([
    fetchAcgeHealth(),
    fetchAcgeAlerts(),
    fetchAcgeProposals(),
    fetchAcgeAudit(30),
    fetchAcgeIdentities(),
    fetchAcgeRegulations(),
  ]);

  const isOnline    = health?.status === "ok";
  const id          = health?.identity;
  const comp        = health?.compliance;
  const gov         = health?.governance;
  const audit       = health?.audit;
  const reg         = health?.regulatory;

  return (
    <>
      <div className="page-header">
        <h1>Autonomous Compliance &amp; Governance Engine</h1>
        <p>Identity verification · AML monitoring · Governance enforcement · Audit trails · Regulatory intelligence (port 9970)</p>
      </div>

      {/* ── Status row ──────────────────────────────────────────────────── */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">ACGE Status</div>
          <div style={{ marginTop: "0.4rem" }}>
            {isOnline
              ? <span className="badge badge-green"><span className="dot" />Running</span>
              : <span className="badge badge-red"><span className="dot" />Offline</span>}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.4rem" }}>
            Cycle #{health?.cycleCount?.toLocaleString() ?? "—"}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Identities</div>
          <div className="card-value" style={{ color: "var(--green)" }}>{id?.verified ?? "—"}</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
            verified / {id?.total ?? "—"} total · {id?.sanctioned ?? 0} sanctioned
          </div>
        </div>
        <div className="card">
          <div className="card-title">Compliance Alerts</div>
          <div className="card-value" style={{ color: (comp?.totalAlerts ?? 0) > 0 ? "var(--red)" : undefined }}>
            {comp?.totalAlerts ?? "—"}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
            {comp?.unreported ?? 0} unreported
          </div>
        </div>
        <div className="card">
          <div className="card-title">Governance</div>
          <div className="card-value">{gov?.active ?? "—"}</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
            {gov?.voting ?? 0} voting · {gov?.executed ?? 0} executed
          </div>
        </div>
      </div>

      {/* ── Identity + Regulatory summary ───────────────────────────────── */}
      <div className="grid grid-2" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">Identity Summary</div>
          <table className="service-table">
            <tbody>
              <tr><td>Verified</td><td style={{ color: "var(--green)" }}>{id?.verified ?? "—"}</td></tr>
              <tr><td>Pending KYC</td><td style={{ color: "var(--yellow)" }}>{id?.pending ?? "—"}</td></tr>
              <tr><td>Rejected</td><td style={{ color: "var(--red)" }}>{id?.rejected ?? "—"}</td></tr>
              <tr><td>Expired</td><td>{id?.expired ?? "—"}</td></tr>
              <tr><td>Sanctioned Addresses</td>
                <td style={{ color: (id?.sanctioned ?? 0) > 0 ? "var(--red)" : undefined }}>
                  {id?.sanctioned ?? "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">Regulatory Intelligence</div>
          <table className="service-table">
            <tbody>
              <tr><td>Active Regulations</td><td>{reg?.activeRegulations ?? "—"}</td></tr>
              <tr><td>Total Rules</td><td>{reg?.totalRegulations ?? "—"}</td></tr>
              <tr><td>Sanctioned Addresses (feeds)</td>
                <td style={{ color: (reg?.sanctionedAddresses ?? 0) > 0 ? "var(--red)" : undefined }}>
                  {reg?.sanctionedAddresses ?? "—"}
                </td>
              </tr>
              {reg?.jurisdictions && Object.entries(reg.jurisdictions).map(([j, n]) => (
                <tr key={j}><td>{j} rules</td><td>{n}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Compliance alerts ────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title" style={{ color: (alerts?.length ?? 0) > 0 ? "var(--red)" : undefined }}>
          Compliance Alerts
        </div>
        {(alerts?.length ?? 0) > 0 ? (
          <table className="service-table">
            <thead>
              <tr><th>Type</th><th>Severity</th><th>Wallet</th><th>Amount (GST)</th><th>Detail</th><th>Reported</th><th>Time</th></tr>
            </thead>
            <tbody>
              {(alerts ?? []).map((a: AcgeComplianceAlert) => (
                <tr key={a.id}>
                  <td><code style={{ fontSize: "0.75rem" }}>{a.type}</code></td>
                  <td>{severityBadge(a.severity)}</td>
                  <td><code style={{ fontSize: "0.7rem" }}>{a.walletAddress.slice(0, 10)}…</code></td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    {a.amount ? Number(BigInt(a.amount) / BigInt(10 ** 18)).toLocaleString() : "—"}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{a.detail}</td>
                  <td>
                    {a.reported
                      ? <span className="badge badge-green"><span className="dot" />Yes</span>
                      : <span className="badge badge-yellow"><span className="dot" />No</span>}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{ts(a.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>No compliance alerts</p>
        )}
      </div>

      {/* ── Identity records ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">Identity Verification Records</div>
        {(identities?.length ?? 0) > 0 ? (
          <table className="service-table">
            <thead>
              <tr><th>Wallet</th><th>User ID</th><th>Status</th><th>Jurisdiction</th><th>Risk Score</th><th>Provider</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {(identities ?? []).slice(0, 25).map((rec: AcgeIdentityRecord) => (
                <tr key={rec.walletAddress}>
                  <td><code style={{ fontSize: "0.7rem" }}>{rec.walletAddress.slice(0, 10)}…</code></td>
                  <td style={{ fontSize: "0.8rem" }}>{rec.userId}</td>
                  <td>{kycBadge(rec.kycStatus)}</td>
                  <td>{rec.jurisdiction}</td>
                  <td style={{ color: rec.riskScore >= 70 ? "var(--red)" : rec.riskScore >= 30 ? "var(--yellow)" : "var(--green)" }}>
                    {rec.riskScore}
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{rec.kycProvider}</td>
                  <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{ts(rec.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>No identity records yet</p>
        )}
      </div>

      {/* ── Governance proposals ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">Governance Proposals</div>
        {(proposals?.length ?? 0) > 0 ? (
          <table className="service-table">
            <thead>
              <tr><th>ID</th><th>Type</th><th>Title</th><th>Status</th><th>Votes (Y/N/A)</th><th>Quorum</th><th>Deadline</th></tr>
            </thead>
            <tbody>
              {(proposals ?? []).slice(0, 20).map((p: AcgeProposal) => {
                const total = p.totalWeight || 1;
                return (
                  <tr key={p.id}>
                    <td><code style={{ fontSize: "0.7rem" }}>{p.id}</code></td>
                    <td><span className="badge badge-green" style={{ fontSize: "0.7rem" }}>{p.type}</span></td>
                    <td style={{ fontSize: "0.8rem", maxWidth: "200px" }}>{p.title}</td>
                    <td>{proposalBadge(p.status)}</td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      <span style={{ color: "var(--green)" }}>{pct(p.voteYes, total)}</span>
                      {" / "}
                      <span style={{ color: "var(--red)" }}>{pct(p.voteNo, total)}</span>
                      {" / "}
                      <span>{pct(p.voteAbstain, total)}</span>
                    </td>
                    <td style={{ fontSize: "0.8rem" }}>
                      {Math.round(p.quorumRequired * 100)}%
                    </td>
                    <td style={{ fontSize: "0.75rem", color: Date.now() > p.votingDeadline ? "var(--red)" : "var(--text-muted)" }}>
                      {new Date(p.votingDeadline).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>No governance proposals</p>
        )}
      </div>

      {/* ── Audit trail ──────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">Audit Trail</div>
        <div style={{ display: "flex", gap: "1.5rem", marginBottom: "0.75rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          <span>Events in memory: <strong style={{ color: "var(--text)" }}>{audit?.totalInMemory ?? "—"}</strong></span>
          <span>Sequence: <strong style={{ color: "var(--text)" }}>#{audit?.sequenceNumber ?? "—"}</strong></span>
          <span style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
            Last hash: {audit?.lastHash?.slice(0, 16) ?? "—"}…
          </span>
        </div>
        {(auditEvents?.length ?? 0) > 0 ? (
          <table className="service-table">
            <thead>
              <tr><th>ID</th><th>Category</th><th>Actor</th><th>Action</th><th>Status</th><th>Time</th></tr>
            </thead>
            <tbody>
              {(auditEvents ?? []).map((e: AcgeAuditEvent) => (
                <tr key={e.id}>
                  <td><code style={{ fontSize: "0.65rem" }}>{e.id}</code></td>
                  <td>
                    <span className="badge badge-green" style={{ fontSize: "0.65rem" }}>
                      {e.category}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{e.actor}</td>
                  <td><code style={{ fontSize: "0.75rem" }}>{e.action}</code></td>
                  <td>
                    <span className={`badge ${e.status === "ok" ? "badge-green" : "badge-red"}`}>
                      <span className="dot" />{e.status}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{ts(e.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>No audit events yet</p>
        )}
      </div>

      {/* ── Regulations ──────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">Active Regulatory Rules ({regulations?.length ?? 0})</div>
        {(regulations?.length ?? 0) > 0 ? (
          <table className="service-table">
            <thead>
              <tr><th>ID</th><th>Jurisdiction</th><th>Category</th><th>Title</th><th>Threshold (GST)</th><th>Source</th></tr>
            </thead>
            <tbody>
              {(regulations ?? []).map((r: AcgeRegulation) => (
                <tr key={r.id}>
                  <td><code style={{ fontSize: "0.7rem" }}>{r.id}</code></td>
                  <td><span className="badge badge-green" style={{ fontSize: "0.7rem" }}>{r.jurisdiction}</span></td>
                  <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{r.category}</td>
                  <td style={{ fontSize: "0.8rem" }}>{r.title}</td>
                  <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {r.threshold ? Number(BigInt(r.threshold) / BigInt(10 ** 18)).toLocaleString() : "—"}
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>No regulations loaded</p>
        )}
      </div>

      {/* ── ACGE REST API reference ──────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">ACGE REST API (port 9970)</div>
        <table className="service-table">
          <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
          <tbody>
            {([
              ["GET",  "/health",                  "Status, metrics summary"],
              ["GET",  "/status",                  "Full compliance + governance snapshot"],
              ["GET",  "/identities",              "All identity records (filter by ?status=)"],
              ["GET",  "/identities/:wallet",      "Single wallet identity record"],
              ["POST", "/identities/verify",       "Submit wallet for KYC verification"],
              ["POST", "/identities/sanction",     "Flag wallet as sanctioned"],
              ["GET",  "/compliance/alerts",       "AML / sanction / velocity alerts"],
              ["GET",  "/proposals",               "Governance proposals (filter by ?status=)"],
              ["POST", "/proposals",               "Create governance proposal"],
              ["POST", "/proposals/:id/vote",      "Cast validator vote on proposal"],
              ["GET",  "/audit",                   "Audit event log (filter by ?category=)"],
              ["POST", "/audit/record",            "Manually record audit event"],
              ["GET",  "/audit/verify",            "Verify hash-chain integrity"],
              ["GET",  "/regulations",             "Active regulations (filter by ?jurisdiction=)"],
              ["POST", "/regulations",             "Add custom regulation"],
              ["GET",  "/regulations/status",      "Regulatory status by jurisdiction"],
            ] as const).map(([m, e, d]) => (
              <tr key={e}>
                <td><code style={{ color: m === "GET" ? "var(--green)" : "var(--accent)" }}>{m}</code></td>
                <td><code style={{ fontSize: "0.75rem" }}>{e}</code></td>
                <td style={{ color: "var(--text-muted)" }}>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
