/**
 * Treasury — GhostChain treasury state, allocations, and liquidity.
 * Sources: EIE economy engine treasury + AEE treasury status.
 */

import {
  fetchEieTreasury,
  fetchEieMarketAlerts,
  fetchAeeTreasury,
  type EieTreasuryState,
  type EieTreasuryAllocation,
  type EieMarketAlert,
} from "@/lib/api";
import { SectionHeader } from "@/components/dashboard/MetricCard";
import { StatusBadge }   from "@/components/dashboard/StatusBadge";

export const metadata = { title: "Treasury · GhostStack" };
export const revalidate = 30;

function wei(s: string | undefined) {
  if (!s) return "—";
  const n = Number(BigInt(s) / BigInt(1e14)) / 1e4;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " GST";
}

const SEV_COLOR: Record<string, string> = {
  critical: "var(--red)",
  high:     "var(--red)",
  warning:  "var(--yellow)",
  info:     "var(--text-muted)",
};

export default async function TreasuryPage() {
  const [eie, marketAlerts, aeeRaw] = await Promise.all([
    fetchEieTreasury(),
    fetchEieMarketAlerts(),
    fetchAeeTreasury(),
  ]);

  const state:       EieTreasuryState       | undefined = eie?.state;
  const allocations: EieTreasuryAllocation[] = eie?.allocations ?? [];
  const alerts:      EieMarketAlert[]        = marketAlerts?.alerts ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Treasury</h1>
        <p>EIE economy engine — allocation, liquidity, and market alerts</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">Total Allocated</div>
          <div className="card-value" style={{ fontSize: "1rem" }}>{wei(state?.totalAllocated)}</div>
        </div>
        <div className="card">
          <div className="card-title">Pending Governance</div>
          <div className="card-value" style={{ fontSize: "1rem" }}>{wei(state?.pendingGovernance)}</div>
        </div>
        <div className="card">
          <div className="card-title">Invested</div>
          <div className="card-value" style={{ fontSize: "1rem" }}>{wei(state?.investedWei)}</div>
        </div>
        <div className="card">
          <div className="card-title">Accrued Revenue</div>
          <div className="card-value" style={{ fontSize: "1rem", color: "var(--green)" }}>
            {wei(state?.accruedRevenueWei)}
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginTop: "1rem" }}>
        <div className="card">
          <div className="card-title">Open Grants</div>
          <div className="card-value">{state?.openGrants ?? "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">Total Grants</div>
          <div className="card-value" style={{ fontSize: "1rem" }}>{wei(state?.totalGrantsWei)}</div>
        </div>
        <div className="card">
          <div className="card-title">This Epoch</div>
          <div className="card-value" style={{ fontSize: "1rem" }}>{wei(state?.executedThisEpoch)}</div>
        </div>
        <div className="card">
          <div className="card-title">Market Alerts</div>
          <div className="card-value" style={{ color: alerts.length > 0 ? "var(--yellow)" : "var(--green)" }}>
            {alerts.length}
          </div>
        </div>
      </div>

      {/* Market alerts */}
      {alerts.length > 0 && (
        <>
          <SectionHeader title="Market Alerts" sub="EIE real-time market risk signals" />
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Severity</th>
                <th>Message</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a: EieMarketAlert, i) => (
                <tr key={i}>
                  <td style={{ color: "var(--accent)" }}>{a.type.replace(/_/g, " ")}</td>
                  <td style={{ color: SEV_COLOR[a.severity] ?? "inherit" }}>{a.severity}</td>
                  <td>{a.message}</td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {new Date(a.timestamp * 1000).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Allocations */}
      <SectionHeader title="Treasury Allocations" sub="EIE allocation queue" />
      {allocations.length === 0 ? (
        <div className="card" style={{ color: "var(--text-muted)" }}>
          No allocations — {eie ? "queue empty" : "EIE offline"}
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Purpose</th>
              <th>Amount</th>
              <th>Requester</th>
              <th>Rationale</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((a: EieTreasuryAllocation) => (
              <tr key={a.id}>
                <td className="code">{a.id.slice(0, 10)}…</td>
                <td style={{ color: "var(--accent)" }}>{a.purpose.replace(/_/g, " ")}</td>
                <td>{wei(a.amountWei)}</td>
                <td className="code" style={{ fontSize: "0.75rem" }}>{a.requester.slice(0, 14)}…</td>
                <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.rationale}
                </td>
                <td>
                  <StatusBadge
                    ok={a.status === "approved" || a.status === "executed"}
                    onLabel={a.status}
                    offLabel={a.status}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
