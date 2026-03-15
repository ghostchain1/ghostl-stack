"use client";
import { useChains } from "@/hooks/useChains";
import { ChainStatusCard } from "@/components/cards/ChainStatusCard";

export default function ChainsPage() {
  const { chains, isLoading, isError, refresh } = useChains();

  return (
    <>
      <div className="page-header">
        <h1>⛓ Chain Status</h1>
        <p>Live telemetry for GhostChain (L1), GhostL2, and GhostL3 — refreshes every 10s</p>
      </div>

      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <div className="flex gap-1">
          {chains.map(c => (
            <span key={c.id} className={`badge badge-${c.status === "healthy" ? "green" : c.status === "degraded" ? "yellow" : "red"}`}>
              <span className="dot" />{c.name.split("(")[0].trim()}
            </span>
          ))}
          {isLoading && <span className="badge badge-gray">Loading…</span>}
          {isError   && <span className="badge badge-red">RPC unreachable</span>}
        </div>
        <button className="btn btn-ghost" onClick={() => refresh()}>↻ Refresh</button>
      </div>

      {/* Chain cards */}
      <div className="grid grid-3" style={{ marginBottom: "1.5rem" }}>
        {chains.map(c => <ChainStatusCard key={c.id} chain={c} />)}
        {!chains.length && !isLoading && (
          <div className="card" style={{ gridColumn: "1/-1", color: "var(--text-muted)", textAlign: "center" }}>
            No chain data available. Ensure RPC endpoints are reachable.
          </div>
        )}
      </div>

      {/* Network info table */}
      {chains.length > 0 && (
        <div className="card">
          <div className="card-title">Network Details</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Network</th>
                <th>Chain ID</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Block Height</th>
                <th style={{ textAlign: "right" }}>TPS</th>
                <th style={{ textAlign: "right" }}>Gas Price</th>
                <th style={{ textAlign: "right" }}>Validators</th>
                <th style={{ textAlign: "right" }}>RPC Latency</th>
              </tr>
            </thead>
            <tbody>
              {chains.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="mono">{c.chainId}</td>
                  <td>
                    <span className={`badge badge-${c.status === "healthy" ? "green" : c.status === "degraded" ? "yellow" : "red"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }} className="mono">{c.blockHeight.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{c.tps}</td>
                  <td style={{ textAlign: "right" }}>{c.gasPrice}</td>
                  <td style={{ textAlign: "right" }}>{c.activeValidators}</td>
                  <td style={{ textAlign: "right", color: c.latency < 50 ? "#10b981" : c.latency < 200 ? "#f59e0b" : "#ef4444" }}>
                    {c.status === "offline" ? "—" : `${c.latency}ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
