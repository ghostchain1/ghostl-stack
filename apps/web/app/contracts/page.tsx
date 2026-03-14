/**
 * Contracts — deployed smart contract registry.
 * Sources: ADE development engine contract inventory.
 */

import {
  fetchAdeContracts,
  fetchAdeAudits,
  type AdeContract,
  type AdeAuditReport,
} from "@/lib/api";
import { SectionHeader } from "@/components/dashboard/MetricCard";
import { StatusBadge }   from "@/components/dashboard/StatusBadge";

export const metadata = { title: "Contracts · GhostStack" };
export const revalidate = 60;

const AUDIT_COLOR: Record<string, string> = {
  passed:  "var(--green)",
  warning: "var(--yellow)",
  failed:  "var(--red)",
  pending: "var(--text-muted)",
};

export default async function ContractsPage() {
  const [contracts, auditReports] = await Promise.all([
    fetchAdeContracts({ limit: 100 }),
    fetchAdeAudits?.({ limit: 20 }).catch(() => null),
  ]);

  const list:   AdeContract[]    = contracts ?? [];
  const audits: AdeAuditReport[] = auditReports ?? [];

  const verified   = list.filter(c => c.verified).length;
  const deployed   = list.filter(c => !!c.address).length;
  const networks   = [...new Set(list.map(c => c.network))];

  return (
    <div>
      <div className="page-header">
        <h1>Smart Contracts</h1>
        <p>ADE engine — contract registry, audits, and deployments</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">Total Contracts</div>
          <div className="card-value">{list.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Deployed</div>
          <div className="card-value" style={{ color: "var(--green)" }}>{deployed}</div>
        </div>
        <div className="card">
          <div className="card-title">Verified</div>
          <div className="card-value">{verified}</div>
        </div>
        <div className="card">
          <div className="card-title">Networks</div>
          <div className="card-value">{networks.length}</div>
          <div className="card-sub">{networks.join(", ")}</div>
        </div>
      </div>

      {/* Contract table */}
      <SectionHeader title="Contract Registry" sub="All ADE-managed smart contracts" />
      {list.length === 0 ? (
        <div className="card" style={{ color: "var(--text-muted)" }}>No contract data — ADE offline?</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Network</th>
              <th>Address</th>
              <th>Functions</th>
              <th>Bytecode</th>
              <th>Audit</th>
              <th>Verified</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c: AdeContract) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td style={{ color: "var(--text-muted)" }}>{c.type}</td>
                <td>{c.network}</td>
                <td className="code" style={{ fontSize: "0.72rem" }}>
                  {c.address ? `${c.address.slice(0, 10)}…` : "—"}
                </td>
                <td>{c.functions}</td>
                <td style={{ color: "var(--text-muted)" }}>
                  {(c.bytecodeSize / 1024).toFixed(1)} KB
                </td>
                <td style={{ color: AUDIT_COLOR[c.auditStatus] ?? "inherit" }}>
                  {c.auditStatus}
                </td>
                <td>
                  <StatusBadge ok={c.verified} onLabel="verified" offLabel="unverified" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Audit reports */}
      {audits.length > 0 && (
        <>
          <SectionHeader title="Audit Reports" sub="Latest security audit results" />
          <table className="table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Score</th>
                <th>Criticals</th>
                <th>Highs</th>
                <th>Mediums</th>
                <th>Lows</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a: AdeAuditReport) => (
                <tr key={a.id}>
                  <td>{a.target}</td>
                  <td style={{ color: a.score >= 80 ? "var(--green)" : a.score >= 60 ? "var(--yellow)" : "var(--red)" }}>
                    {a.score}/100
                  </td>
                  <td style={{ color: a.criticals > 0 ? "var(--red)" : "inherit" }}>{a.criticals}</td>
                  <td style={{ color: a.highs > 0 ? "var(--yellow)" : "inherit" }}>{a.highs}</td>
                  <td>{a.mediums}</td>
                  <td>{a.lows}</td>
                  <td>
                    <StatusBadge ok={a.passed} onLabel="passed" offLabel="failed" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
