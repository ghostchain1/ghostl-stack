// GhostStack — Transaction History
"use client";
import useSWR from "swr";
import { useState } from "react";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Tx {
  hash:      string;
  type:      "send" | "receive" | "stake" | "unstake" | "governance" | "bridge" | "contract";
  amount:    string;
  token:     string;
  from:      string;
  to:        string;
  chain:     string;
  status:    "confirmed" | "pending" | "failed";
  timestamp: number;
  fee:       string;
}

function timeSince(ts: number) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return `${Math.floor(d/86400)}d ago`;
}

const TYPE_ICONS: Record<string, string> = {
  send: "tx-icon-send", receive: "tx-icon-recv", stake: "tx-icon-stake",
  unstake: "tx-icon-stake", governance: "tx-icon-gov", bridge: "tx-icon-stake", contract: "tx-icon-gov",
};
const TYPE_EMOJI: Record<string, string> = {
  send: "📤", receive: "📥", stake: "🔒", unstake: "🔓", governance: "🏛", bridge: "🌉", contract: "📄",
};

export default function TransactionsPage() {
  const { data, isLoading, mutate } = useSWR<{ txs: Tx[]; total: number }>(
    "/api/user/transactions",
    fetcher,
    { refreshInterval: 15_000 },
  );

  const [chainFilter, setChainFilter] = useState("all");
  const [typeFilter,  setTypeFilter]  = useState("all");

  const txs = (data?.txs ?? []).filter(t => {
    if (chainFilter !== "all" && t.chain !== chainFilter) return false;
    if (typeFilter  !== "all" && t.type  !== typeFilter)  return false;
    return true;
  });

  return (
    <>
      <div className="page-header">
        <h1>📋 Transactions</h1>
        <p>Your full transaction history across GhostChain L1, L2, and L3</p>
      </div>

      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <div className="flex gap-1">
          <span className="badge badge-gray">{data?.total ?? 0} total txs</span>
          {txs.filter(t=>t.status==="pending").length > 0 && (
            <span className="badge badge-yellow">{txs.filter(t=>t.status==="pending").length} pending</span>
          )}
        </div>
        <button className="btn btn-ghost" onClick={() => mutate()}>↻ Refresh</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div className="contract-filter-bar" style={{ margin: 0 }}>
          {["all","L1","L2","L3"].map(c => (
            <button key={c} className={`filter-chip ${chainFilter===c?"active":""}`} onClick={() => setChainFilter(c)}>{c}</button>
          ))}
        </div>
        <div className="contract-filter-bar" style={{ margin: 0 }}>
          {["all","send","receive","stake","governance","bridge"].map(t => (
            <button key={t} className={`filter-chip ${typeFilter===t?"active":""}`} onClick={() => setTypeFilter(t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* Transaction list */}
      <div className="card">
        <div className="tx-list">
          {isLoading && <div style={{ color: "var(--text-muted)", padding: "1rem" }}>Loading transactions…</div>}
          {txs.map((tx, i) => (
            <div key={i} className="tx-row">
              <div className={`tx-icon ${TYPE_ICONS[tx.type] ?? "tx-icon-gov"}`}>{TYPE_EMOJI[tx.type] ?? "📄"}</div>
              <div className="tx-details">
                <div className="tx-type" style={{ textTransform: "capitalize" }}>{tx.type}</div>
                <div className="tx-hash">{tx.hash.slice(0, 20)}…</div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{tx.chain}</div>
                <span className={`badge badge-${tx.status==="confirmed"?"green":tx.status==="pending"?"yellow":"red"}`} style={{ fontSize: "0.6rem" }}>{tx.status}</span>
              </div>
              <div className={tx.type === "receive" || tx.type === "stake" ? "tx-amount-positive" : (tx.type === "send" || tx.type === "unstake" ? "tx-amount-negative" : "tx-amount-neutral")}>
                {tx.type === "receive" ? "+" : (tx.type === "send" || tx.type === "unstake" ? "-" : "")}{tx.amount} {tx.token}
              </div>
              <div className="tx-time">{timeSince(tx.timestamp)}</div>
            </div>
          ))}
          {!isLoading && txs.length === 0 && (
            <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem", fontSize: "0.85rem" }}>
              No transactions found matching current filters.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
