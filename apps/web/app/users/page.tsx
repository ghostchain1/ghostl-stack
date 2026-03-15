/**
 * Users — identity / KYC registry from ACGE.
 */

import {
  fetchAcgeIdentities,
  fetchAcgeHealth,
  type AcgeIdentityRecord,
  type KycStatus,
} from "@/lib/api";
import { SectionHeader } from "@/components/dashboard/MetricCard";

export const metadata = { title: "Users · GhostStack" };
export const revalidate = 60;

const KYC_COLOR: Record<KycStatus, string> = {
  verified: "var(--green)",
  pending:  "var(--yellow)",
  rejected: "var(--red)",
  expired:  "var(--text-muted)",
};

function kycBadge(status: KycStatus) {
  return (
    <span style={{ color: KYC_COLOR[status] ?? "inherit", fontWeight: 700, fontSize: "0.78rem" }}>
      {status.toUpperCase()}
    </span>
  );
}

function fmtTs(ts?: number) {
  if (!ts) return "—";
  return new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleDateString();
}

export default async function UsersPage() {
  const [identities, health] = await Promise.all([
    fetchAcgeIdentities(),
    fetchAcgeHealth(),
  ]);

  const users: AcgeIdentityRecord[] = identities ?? [];

  const idStats = health?.identity ?? null;

  const sanctioned = users.filter((u) => u.sanctioned).length;
  const highRisk    = users.filter((u) => u.riskScore >= 70).length;

  return (
    <div>
      <div className="page-header">
        <h1>Users</h1>
        <p>Identity registry, KYC status, and compliance risk from ACGE</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        {idStats ? (
          <>
            <div className="card">
              <div className="card-title">Total Identities</div>
              <div className="card-value">{idStats.total.toLocaleString()}</div>
            </div>
            <div className="card">
              <div className="card-title">Verified</div>
              <div className="card-value" style={{ color: "var(--green)" }}>{idStats.verified.toLocaleString()}</div>
            </div>
            <div className="card">
              <div className="card-title">Pending KYC</div>
              <div className="card-value" style={{ color: "var(--yellow)" }}>{idStats.pending.toLocaleString()}</div>
            </div>
            <div className="card">
              <div className="card-title">Sanctioned</div>
              <div className="card-value" style={{ color: idStats.sanctioned > 0 ? "var(--red)" : "var(--green)" }}>
                {idStats.sanctioned.toLocaleString()}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="card">
              <div className="card-title">Records Loaded</div>
              <div className="card-value">{users.length}</div>
            </div>
            <div className="card">
              <div className="card-title">Verified</div>
              <div className="card-value" style={{ color: "var(--green)" }}>
                {users.filter((u) => u.kycStatus === "verified").length}
              </div>
            </div>
            <div className="card">
              <div className="card-title">Sanctioned</div>
              <div className="card-value" style={{ color: sanctioned > 0 ? "var(--red)" : "var(--green)" }}>{sanctioned}</div>
            </div>
            <div className="card">
              <div className="card-title">High Risk (≥70)</div>
              <div className="card-value" style={{ color: highRisk > 0 ? "var(--yellow)" : "var(--green)" }}>{highRisk}</div>
            </div>
          </>
        )}
      </div>

      {/* Identity table */}
      <SectionHeader title="Identity Registry" sub="ACGE: KYC-verified on-chain identities" />
      {users.length === 0 ? (
        <div className="card" style={{ color: "var(--text-muted)" }}>No identity records — ACGE offline?</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Wallet</th>
              <th>KYC Status</th>
              <th>Provider</th>
              <th>Jurisdiction</th>
              <th>Risk Score</th>
              <th>Sanctioned</th>
              <th>Verified</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.walletAddress} style={{ opacity: u.sanctioned ? 0.7 : 1 }}>
                <td className="code" style={{ fontSize: "0.72rem" }}>
                  {u.walletAddress.slice(0, 10)}…{u.walletAddress.slice(-6)}
                </td>
                <td>{kycBadge(u.kycStatus)}</td>
                <td style={{ color: "var(--text-muted)" }}>{u.kycProvider}</td>
                <td>{u.jurisdiction}</td>
                <td style={{ color: u.riskScore >= 70 ? "var(--red)" : u.riskScore >= 40 ? "var(--yellow)" : "var(--green)" }}>
                  {u.riskScore.toFixed(0)}
                </td>
                <td style={{ color: u.sanctioned ? "var(--red)" : "var(--green)", fontWeight: 700 }}>
                  {u.sanctioned ? "⚠ YES" : "No"}
                </td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{fmtTs(u.verifiedAt)}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{fmtTs(u.expiresAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
