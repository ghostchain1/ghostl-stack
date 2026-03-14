/**
 * Alerts — unified feed from TDS (threat detection), ACGE (compliance),
 * and EIE (market) alert streams.
 */

import {
  fetchTdsStatus,
  fetchAcgeAlerts,
  fetchEieMarketAlerts,
  type TdsAlert,
  type AcgeComplianceAlert,
  type EieMarketAlert,
} from "@/lib/api";
import { SectionHeader } from "@/components/dashboard/MetricCard";

export const metadata = { title: "Alerts · GhostStack" };
export const revalidate = 15;

const SEV_COLOR: Record<string, string> = {
  critical: "var(--red)",
  high:     "var(--red)",
  medium:   "var(--yellow)",
  low:      "var(--text-muted)",
  info:     "var(--text-muted)",
};

function badge(severity: string) {
  return (
    <span style={{ color: SEV_COLOR[severity.toLowerCase()] ?? "inherit", fontWeight: 700, textTransform: "uppercase", fontSize: "0.72rem" }}>
      {severity}
    </span>
  );
}

function fmtTs(ts: number | string) {
  const d = typeof ts === "number" ? new Date(ts < 1e12 ? ts * 1000 : ts) : new Date(ts);
  return d.toLocaleString();
}

export default async function AlertsPage() {
  const [tds, acge, mkt] = await Promise.all([
    fetchTdsStatus(),
    fetchAcgeAlerts(),
    fetchEieMarketAlerts(),
  ]);

  const tdsAlerts: TdsAlert[]              = tds?.alerts ?? [];
  const acgeAlerts: AcgeComplianceAlert[]  = acge ?? [];
  const mktAlerts: EieMarketAlert[]        = mkt?.alerts ?? [];

  const totalCritical =
    tdsAlerts.filter((a) => ["critical", "high"].includes(a.severity.toLowerCase())).length +
    acgeAlerts.filter((a) => ["critical", "high"].includes(a.severity)).length +
    mktAlerts.filter((a) => ["critical", "high"].includes(a.severity?.toLowerCase() ?? "")).length;

  return (
    <div>
      <div className="page-header">
        <h1>Alerts</h1>
        <p>Threat detection, compliance, and market alert feed</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">Threat Alerts (TDS)</div>
          <div className="card-value" style={{ color: tdsAlerts.length ? "var(--yellow)" : "var(--green)" }}>{tdsAlerts.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Compliance Alerts</div>
          <div className="card-value" style={{ color: acgeAlerts.length ? "var(--yellow)" : "var(--green)" }}>{acgeAlerts.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Market Alerts</div>
          <div className="card-value" style={{ color: mktAlerts.length ? "var(--yellow)" : "var(--green)" }}>{mktAlerts.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Critical / High</div>
          <div className="card-value" style={{ color: totalCritical > 0 ? "var(--red)" : "var(--green)" }}>{totalCritical}</div>
        </div>
      </div>

      {/* TDS threat alerts */}
      <SectionHeader title="Threat Detection Alerts" sub="Source: TDS intrusion & anomaly engine" />
      {tdsAlerts.length === 0 ? (
        <div className="card" style={{ color: "var(--green)" }}>No active threat alerts</div>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Severity</th><th>Type</th><th>Message</th><th>Source IP</th><th>Count</th><th>Time</th></tr>
          </thead>
          <tbody>
            {tdsAlerts.map((a, i) => (
              <tr key={i}>
                <td>{badge(a.severity)}</td>
                <td style={{ color: "var(--accent)" }}>{a.type}</td>
                <td>{a.message}</td>
                <td className="code">{a.sourceIp ?? "—"}</td>
                <td>{a.count}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{fmtTs(a.ts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* TDS chain threats */}
      {(tds?.chainThreats?.length ?? 0) > 0 && (
        <>
          <SectionHeader title="Chain-Level Threats" sub="On-chain threat signals detected by TDS" />
          <table className="table">
            <thead>
              <tr><th>Severity</th><th>Chain</th><th>Type</th><th>Detail</th><th>Time</th></tr>
            </thead>
            <tbody>
              {tds!.chainThreats.map((t, i) => (
                <tr key={i}>
                  <td>{badge(t.severity)}</td>
                  <td style={{ color: "var(--accent)" }}>{t.chain}</td>
                  <td>{t.type}</td>
                  <td>{t.detail}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{fmtTs(t.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ACGE compliance alerts */}
      <SectionHeader title="Compliance Alerts" sub="Source: ACGE KYC / AML engine" />
      {acgeAlerts.length === 0 ? (
        <div className="card" style={{ color: "var(--green)" }}>No compliance alerts</div>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Severity</th><th>Type</th><th>Wallet</th><th>Detail</th><th>Reported</th><th>Time</th></tr>
          </thead>
          <tbody>
            {acgeAlerts.map((a) => (
              <tr key={a.id}>
                <td>{badge(a.severity)}</td>
                <td style={{ color: "var(--accent)" }}>{a.type}</td>
                <td className="code" style={{ fontSize: "0.78rem" }}>{a.walletAddress}</td>
                <td>{a.detail}</td>
                <td style={{ color: a.reported ? "var(--green)" : "var(--yellow)" }}>{a.reported ? "Yes" : "Pending"}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{fmtTs(a.ts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Market alerts */}
      <SectionHeader title="Market Alerts" sub="Source: EIE economic monitoring" />
      {mktAlerts.length === 0 ? (
        <div className="card" style={{ color: "var(--green)" }}>No active market alerts</div>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Severity</th><th>Type</th><th>Pair</th><th>Message</th><th>Time</th></tr>
          </thead>
          <tbody>
            {mktAlerts.map((a, i) => (
              <tr key={i}>
                <td>{badge(a.severity ?? "info")}</td>
                <td style={{ color: "var(--accent)" }}>{a.type}</td>
                <td>{a.pair ?? "—"}</td>
                <td>{a.message}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{fmtTs(a.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
