"use client";
import type { ValidatorSummary } from "@/services/ghostchainService";

interface Props {
  validators: ValidatorSummary[];
  onAction?:  (address: string, action: "unjail" | "slash") => void;
}

const STATUS_BADGE: Record<string, string> = {
  active:    "badge-green",
  jailed:    "badge-red",
  unbonding: "badge-yellow",
  inactive:  "badge-gray",
};

export function ValidatorTable({ validators, onAction }: Props) {
  if (!validators.length) return (
    <div style={{ color: "var(--text-muted)", padding: "1rem", textAlign: "center" }}>
      No validators found or ARE offline.
    </div>
  );

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Validator</th>
          <th>Status</th>
          <th style={{ textAlign: "right" }}>Voting Power</th>
          <th style={{ textAlign: "right" }}>Commission</th>
          <th style={{ textAlign: "right" }}>Uptime</th>
          {onAction && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {validators.map(v => (
          <tr key={v.address}>
            <td>
              <div className="validator-cell">
                <span className="moniker">{v.moniker}</span>
                <span className="address mono">{v.address.slice(0, 10)}…{v.address.slice(-6)}</span>
              </div>
            </td>
            <td>
              <span className={`badge ${STATUS_BADGE[v.status] ?? "badge-gray"}`}>
                {v.status}
              </span>
            </td>
            <td style={{ textAlign: "right" }}>{v.votingPower.toLocaleString()}</td>
            <td style={{ textAlign: "right" }}>{v.commission}%</td>
            <td style={{ textAlign: "right" }}>
              <span style={{ color: v.uptimePct >= 99 ? "#10b981" : v.uptimePct >= 95 ? "#f59e0b" : "#ef4444" }}>
                {v.uptimePct.toFixed(2)}%
              </span>
            </td>
            {onAction && (
              <td>
                {v.status === "jailed" && (
                  <button className="btn-mini" onClick={() => onAction(v.address, "unjail")}>
                    Unjail
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
