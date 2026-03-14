/**
 * Validators — active validator set across GhostChain L1/L2/L3.
 * Sources: ASE validator registry + INE orbital validators.
 */

import {
  fetchAseValidators,
  fetchIneValidators,
  type IneOrbitalValidator,
} from "@/lib/api";
import { SectionHeader } from "@/components/dashboard/MetricCard";
import { StatusBadge }   from "@/components/dashboard/StatusBadge";

export const metadata = { title: "Validators · GhostStack" };
export const revalidate = 20;

function formatWei(wei: string | undefined) {
  if (!wei) return "—";
  const eth = Number(BigInt(wei) / BigInt(1e15)) / 1e3;
  return eth.toFixed(2) + " GST";
}

export default async function ValidatorsPage() {
  const [aseRaw, ineValidators] = await Promise.all([
    fetchAseValidators(),
    fetchIneValidators(),
  ]);

  // ASE returns an arbitrary shape — normalise defensively
  const aseList: unknown[] = Array.isArray(aseRaw)
    ? aseRaw
    : aseRaw && typeof aseRaw === "object" && "validators" in (aseRaw as object)
      ? ((aseRaw as Record<string, unknown>).validators as unknown[])
      : [];

  const ine: IneOrbitalValidator[] = ineValidators ?? [];

  const ineOnline  = ine.filter(v => v.status === "active" || v.status === "online").length;
  const ineTotal   = ine.length;

  return (
    <div>
      <div className="page-header">
        <h1>Validators</h1>
        <p>Active validator set, orbital assignments, and uptime metrics</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">ASE Validators</div>
          <div className="card-value">{aseList.length || "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">INE Orbital</div>
          <div className="card-value">{ineTotal}</div>
        </div>
        <div className="card">
          <div className="card-title">Active (INE)</div>
          <div className="card-value" style={{ color: "var(--green)" }}>{ineOnline}</div>
          <div className="card-sub">of {ineTotal}</div>
        </div>
        <div className="card">
          <div className="card-title">Networks Covered</div>
          <div className="card-value">
            {ine.length > 0 ? [...new Set(ine.map(v => v.network))].length : "—"}
          </div>
        </div>
      </div>

      {/* INE validator table */}
      <SectionHeader title="Orbital Validators (INE)" sub="Interplanetary Node Engine validator registry" />
      {ine.length === 0 ? (
        <div className="card" style={{ color: "var(--text-muted)" }}>No INE validator data — INE offline?</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Network</th>
              <th>Orbit Type</th>
              <th>Block Height</th>
              <th>Uptime</th>
              <th>Missed Slots</th>
              <th>Latency</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ine.map(v => (
              <tr key={v.id}>
                <td className="code">{v.id.slice(0, 12)}…</td>
                <td>{v.network}</td>
                <td>{v.orbitType ?? "—"}</td>
                <td className="code">{v.blockHeight.toLocaleString()}</td>
                <td style={{ color: v.uptime > 99 ? "var(--green)" : "var(--yellow)" }}>
                  {v.uptime.toFixed(2)}%
                </td>
                <td style={{ color: v.missedSlots > 0 ? "var(--red)" : "inherit" }}>
                  {v.missedSlots}
                </td>
                <td>{v.latency_ms} ms</td>
                <td>
                  <StatusBadge
                    ok={v.status === "active" || v.status === "online"}
                    onLabel={v.status}
                    offLabel={v.status}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ASE validators (raw) */}
      {aseList.length > 0 && (
        <>
          <SectionHeader title="ASE Validator Registry" sub="Security Engine validator monitoring" />
          <table className="table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Stake</th>
                <th>Status</th>
                <th>Slashed</th>
              </tr>
            </thead>
            <tbody>
              {aseList.map((v: any, i) => (
                <tr key={i}>
                  <td className="code">{v.address ?? v.id ?? `validator-${i + 1}`}</td>
                  <td>{formatWei(v.stakedWei ?? v.stake)}</td>
                  <td>
                    <StatusBadge ok={v.status === "active" || v.active} onLabel={v.status ?? "active"} offLabel={v.status ?? "inactive"} />
                  </td>
                  <td style={{ color: v.slashed ? "var(--red)" : "var(--text-muted)" }}>
                    {v.slashed ? "Yes" : "No"}
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
