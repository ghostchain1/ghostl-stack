/**
 * Blockchain — multi-chain network status dashboard.
 *
 * Shows L1/L2/L3 chain metrics (block height, TPS, gas, health status)
 * sourced from the GIN chain metrics endpoint + AIM RPC node inventory.
 */

import { fetchNetworkOverview, formatGwei } from "@/lib/blockchainApi";
import { fetchAimRpcNodes }                  from "@/lib/ghostbrainApi";
import { SectionHeader }                     from "@/components/dashboard/MetricCard";
import { StatusBadge }                       from "@/components/dashboard/StatusBadge";

export const metadata = { title: "Blockchain · GhostStack" };

const STATUS_BADGE: Record<string, string> = {
  operational: "badge-green",
  degraded:    "badge-yellow",
  congested:   "badge-yellow",
  unknown:     "badge-red",
};

export default async function BlockchainPage() {
  const [overview, rpcNodes] = await Promise.all([
    fetchNetworkOverview(),
    fetchAimRpcNodes(),
  ]);

  const { chains, totalTps, healthyChains } = overview;
  const nodes = rpcNodes ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Blockchain Networks</h1>
        <p>Live multi-chain status — L1 · L2 · L3</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">Tracked Chains</div>
          <div className="card-value">{chains.length || "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">Healthy</div>
          <div className="card-value">{healthyChains}</div>
          <div className="card-sub">of {chains.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Total TPS</div>
          <div className="card-value">{totalTps.toFixed(1)}</div>
        </div>
        <div className="card">
          <div className="card-title">RPC Nodes</div>
          <div className="card-value">{nodes.length}</div>
        </div>
      </div>

      {/* Chain metrics table */}
      <SectionHeader title="Chain Status" sub="Aggregated from GIN intelligence layer" />
      {chains.length === 0 ? (
        <div className="card">
          <p className="text-muted">No chain metrics available — GIN may be offline</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="service-table">
            <thead>
              <tr>
                <th>Chain</th>
                <th>Layer</th>
                <th>Status</th>
                <th>Block Height</th>
                <th>TPS</th>
                <th>Gas Price</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {chains.map((chain) => (
                <tr key={chain.chainId}>
                  <td><strong>{chain.label}</strong></td>
                  <td>
                    <span className="badge">{chain.layer}</span>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[chain.status] ?? "badge-red"}`}>
                      {chain.status}
                    </span>
                  </td>
                  <td>{chain.blockHeight.toLocaleString()}</td>
                  <td>{chain.tps.toFixed(2)}</td>
                  <td>{chain.gasPrice}</td>
                  <td className="text-muted">{chain.latencyMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* RPC node inventory */}
      <SectionHeader title="RPC Node Inventory" sub="Managed by AIM" />
      {nodes.length === 0 ? (
        <div className="card">
          <p className="text-muted">No RPC nodes returned — AIM may be offline</p>
        </div>
      ) : (
        <div className="grid grid-3">
          {nodes.map((node, i) => (
            <div key={`${node.url}-${i}`} className="card">
              <div className="card-title" style={{ fontSize: "0.8rem", fontFamily: "monospace" }}>
                {node.url}
              </div>
              <div className="card-value">
                <StatusBadge ok={node.healthy} onLabel="Healthy" offLabel="Unhealthy" />
              </div>
              <div className="card-sub text-muted">
                {node.region}
                {node.latencyMs != null ? ` · ${node.latencyMs}ms` : ""}
              </div>
              <div className="card-sub text-muted">
                Load: {(node.load * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
