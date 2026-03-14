"use client";
import type { ChainStatus } from "@/services/ghostchainService";

interface Props { chain: ChainStatus }

const STATUS_COLOR: Record<string, string> = {
  healthy:  "#10b981",
  degraded: "#f59e0b",
  offline:  "#ef4444",
};

const STATUS_BADGE: Record<string, string> = {
  healthy:  "badge-green",
  degraded: "badge-yellow",
  offline:  "badge-red",
};

export function ChainStatusCard({ chain }: Props) {
  const color = STATUS_COLOR[chain.status] ?? "#64748b";
  return (
    <div className="chain-card" style={{ borderLeftColor: color }}>
      <div className="chain-card-header">
        <span className="chain-name">{chain.name}</span>
        <span className={`badge ${STATUS_BADGE[chain.status] ?? "badge-gray"}`}>
          <span className="dot" />
          {chain.status}
        </span>
      </div>
      <div className="chain-metrics">
        <div className="metric">
          <div className="metric-label">Block</div>
          <div className="metric-value">{chain.blockHeight.toLocaleString()}</div>
        </div>
        <div className="metric">
          <div className="metric-label">TPS</div>
          <div className="metric-value">{chain.tps}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Gas</div>
          <div className="metric-value" style={{ fontSize: "0.78rem" }}>{chain.gasPrice}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Validators</div>
          <div className="metric-value">{chain.activeValidators}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Latency</div>
          <div className="metric-value" style={{ color: chain.latency < 50 ? "#10b981" : chain.latency < 200 ? "#f59e0b" : "#ef4444" }}>
            {chain.status === "offline" ? "—" : `${chain.latency}ms`}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Staked</div>
          <div className="metric-value" style={{ fontSize: "0.78rem" }}>{chain.totalStaked}</div>
        </div>
      </div>
    </div>
  );
}
