// GhostStack C3 — GNS (Ghost Name System) Dashboard
"use client";
import useSWR from "swr";
import { useState } from "react";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface GNSRecord {
  name:      string;
  owner:     string;
  resolver:  string;
  expiry:    number;
  chain:     string;
  ttl:       number;
}

interface GNSStats {
  totalNames:    number;
  registered24h: number;
  expiring7d:    number;
  totalRevenue:  number;
  records:       GNSRecord[];
}

function fmtExpiry(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function GNSPage() {
  const { data, isLoading, mutate } = useSWR<GNSStats>(
    "/api/gns/stats",
    fetcher,
    { refreshInterval: 30_000 },
  );
  const [search, setSearch] = useState("");

  const records = (data?.records ?? []).filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.owner.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <div className="page-header">
        <h1>🔤 Ghost Name System</h1>
        <p>GNS — GhostChain decentralized naming (replaces ENS) · Registrations, resolvers, and expiry tracking</p>
      </div>

      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <span className="badge badge-cyan">GNS · Ghost Name System</span>
        <button className="btn btn-ghost" onClick={() => mutate()}>↻ Refresh</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card"><div className="stat-label">Total Names</div><div className="stat-value">{data?.totalNames?.toLocaleString() ?? "—"}</div></div>
        <div className="stat-card"><div className="stat-label">Registered 24h</div><div className="stat-value text-green">{data?.registered24h ?? "—"}</div></div>
        <div className="stat-card"><div className="stat-label">Expiring in 7 days</div><div className="stat-value text-yellow">{data?.expiring7d ?? "—"}</div></div>
        <div className="stat-card"><div className="stat-label">Total Revenue (GST)</div><div className="stat-value text-accent">{data?.totalRevenue ? data.totalRevenue.toLocaleString() : "—"}</div></div>
      </div>

      {/* Name lookup */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div className="section-header">
          <span className="section-title">Name Registry</span>
          <input
            type="text"
            placeholder="Search .ghost names or address…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.4rem 0.7rem", color: "var(--text)", fontSize: "0.82rem", width: "240px" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "0.35rem" }}>
          <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", padding: "0.3rem 0.75rem" }}>Name</div>
          <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", padding: "0.3rem 0.5rem" }}>Owner</div>
          <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", padding: "0.3rem 0.5rem" }}>Expiry</div>
          <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", padding: "0.3rem 0.5rem" }}>Chain</div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)" }}>
          {records.slice(0, 30).map((r, i) => (
            <div key={i} className="gns-row">
              <div>
                <div className="gns-name">{r.name}</div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "monospace" }}>ttl {r.ttl}s</div>
              </div>
              <div className="gns-owner">{r.owner.slice(0, 8)}…{r.owner.slice(-4)}</div>
              <div style={{ fontSize: "0.78rem", color: r.expiry * 1000 - Date.now() < 7 * 86400 * 1000 ? "var(--yellow)" : "var(--text)" }}>
                {fmtExpiry(r.expiry)}
              </div>
              <div>
                <span className={`contract-chain-badge ${r.chain === "L1" ? "contract-chain-l1" : r.chain === "L2" ? "contract-chain-l2" : "contract-chain-l3"}`}>{r.chain}</span>
              </div>
            </div>
          ))}
          {!isLoading && records.length === 0 && (
            <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem", fontSize: "0.85rem" }}>
              {!data ? "GNS API offline. Ensure ghost-dns-ai / gns-api service is running." : "No names match search."}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
