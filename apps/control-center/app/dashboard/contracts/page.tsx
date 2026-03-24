// GhostStack C3 — Contract Registry & Explorer
"use client";
import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface ContractEntry {
  name:        string;
  address:     string;
  chain:       "L1" | "L2" | "L3";
  category:    string;
  description: string;
  verified:    boolean;
  deployedAt?: string;
  bytecodeSize?: number;
}

const CANONICAL: ContractEntry[] = [
  { name: "L2L3Bridge",           address: "0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2", chain: "L2", category: "bridge",     description: "L2↔L3 canonical bridge escrow",                  verified: true },
  { name: "L1 Rollup (L2)",       address: "0xad32D5C2Da9f4159C4cc98686C005852b3905355", chain: "L1", category: "rollup",     description: "L2 rollup contract anchored on GhostChain L1",    verified: true },
  { name: "L2 Rollup (L3)",       address: "0x130A46b6E41DB6E1e18fb9c759F223c459190e90", chain: "L2", category: "rollup",     description: "L3 rollup contract anchored on GhostL2",           verified: true },
  { name: "Finality Oracle L1",   address: "0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422", chain: "L1", category: "oracle",     description: "Settlement finality oracle on GhostChain L1",      verified: true },
  { name: "Finality Oracle L2",   address: "0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A", chain: "L2", category: "oracle",     description: "Settlement finality oracle on GhostL2",             verified: true },
  { name: "Finality Oracle L3",   address: "0x87F850cbC2cFfac086F20d0d7307E12d06fA2127", chain: "L3", category: "oracle",     description: "Settlement finality oracle on GhostL3",             verified: true },
  { name: "GhostChainGovernor",   address: "0x0000000000000000000000000000000000000100", chain: "L1", category: "governance", description: "Custom governance contract — proposal & voting",     verified: true },
  { name: "SovereignTreasury",    address: "0x0000000000000000000000000000000000000101", chain: "L1", category: "treasury",   description: "SovereignTreasuryEngine — fee distribution",         verified: true },
  { name: "GhostConstitution",    address: "0x0000000000000000000000000000000000000102", chain: "L1", category: "governance", description: "Immutable + amendable on-chain law clauses",         verified: true },
  { name: "LoadBalancerVault",    address: "0x0000000000000000000000000000000000000110", chain: "L1", category: "lge",        description: "LGE — liquidity load balancer vault",                verified: true },
  { name: "AdapterRegistry",      address: "0x0000000000000000000000000000000000000111", chain: "L1", category: "lge",        description: "LGE — registered liquidity adapters",                verified: true },
  { name: "SettlementOracle",     address: "0x0000000000000000000000000000000000000112", chain: "L1", category: "lge",        description: "LGE — settlement oracle (pauses vault if unhealthy)", verified: true },
  { name: "CircuitBreaker",       address: "0x0000000000000000000000000000000000000113", chain: "L1", category: "lge",        description: "LGE — circuit breaker & watchdog remediation",        verified: true },
  { name: "BridgeEscrow",         address: "0x0000000000000000000000000000000000000114", chain: "L1", category: "lge",        description: "LGE — bridge escrow for cross-chain liquidity",       verified: true },
  { name: "GhostBrand",           address: "0x0000000000000000000000000000000000000120", chain: "L1", category: "utility",    description: "Base contract — GST_UNIT, CANONICAL_GST, chain IDs",  verified: true },
  { name: "RewardDistributor",    address: "0x0000000000000000000000000000000000000130", chain: "L1", category: "treasury",   description: "Staking rewards distribution engine",                 verified: true },
];

const CATEGORIES = ["all", "bridge", "rollup", "oracle", "governance", "treasury", "lge", "utility"];

export default function ContractsPage() {
  const { data: registryData, isLoading } = useSWR<ContractEntry[]>(
    "/api/contracts/registry",
    fetcher,
    { refreshInterval: 60_000 },
  );
  const [chainFilter, setChainFilter] = useState<"all" | "L1" | "L2" | "L3">("all");
  const [catFilter,   setCatFilter]   = useState("all");
  const [search, setSearch] = useState("");

  const allContracts = registryData ?? CANONICAL;
  const filtered = allContracts.filter(c => {
    if (chainFilter !== "all" && c.chain !== chainFilter) return false;
    if (catFilter !== "all" && c.category !== catFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.address.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const chainBadge = (c: string) => {
    if (c === "L1") return "contract-chain-l1";
    if (c === "L2") return "contract-chain-l2";
    return "contract-chain-l3";
  };

  return (
    <>
      <div className="page-header">
        <h1>📋 Contract Registry</h1>
        <p>All deployed smart contracts across GhostChain L1 (chain 14000101), GhostL2 (chain 901), and GhostL3 (chain 903)</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card"><div className="stat-label">Total Contracts</div><div className="stat-value">{allContracts.length}</div></div>
        <div className="stat-card"><div className="stat-label">L1 Contracts</div><div className="stat-value text-accent">{allContracts.filter(c=>c.chain==="L1").length}</div></div>
        <div className="stat-card"><div className="stat-label">L2 Contracts</div><div className="stat-value text-green">{allContracts.filter(c=>c.chain==="L2").length}</div></div>
        <div className="stat-card"><div className="stat-label">Verified</div><div className="stat-value text-cyan">{allContracts.filter(c=>c.verified).length}</div></div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search name or address…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: "200px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.45rem 0.75rem", color: "var(--text)", fontSize: "0.82rem" }}
          />
          <div className="contract-filter-bar" style={{ margin: 0 }}>
            {(["all","L1","L2","L3"] as const).map(ch => (
              <button key={ch} className={`filter-chip ${chainFilter === ch ? "active" : ""}`} onClick={() => setChainFilter(ch)}>{ch}</button>
            ))}
          </div>
          <div className="contract-filter-bar" style={{ margin: 0 }}>
            {CATEGORIES.map(cat => (
              <button key={cat} className={`filter-chip ${catFilter === cat ? "active" : ""}`} onClick={() => setCatFilter(cat)}>{cat}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Contract list */}
      <div className="card">
        <div className="section-header">
          <span className="section-title">Contracts ({filtered.length})</span>
          {isLoading && <span className="badge badge-yellow">Syncing registry…</span>}
        </div>
        {filtered.map((c, i) => (
          <div key={i} className="contract-row">
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
                <span className="contract-name">{c.name}</span>
                <span className={`contract-chain-badge ${chainBadge(c.chain)}`}>{c.chain}</span>
                {c.verified && <span style={{ fontSize: "0.65rem", color: "var(--green)" }}>✓ verified</span>}
              </div>
              <div className="contract-desc">{c.description}</div>
              <div className="contract-address">{c.address}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3rem" }}>
              <span style={{ fontSize: "0.65rem", padding: "0.12rem 0.45rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text-muted)" }}>{c.category}</span>
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.68rem", padding: "0.2rem 0.5rem" }}
                onClick={() => navigator.clipboard.writeText(c.address)}
              >📋 Copy</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>
            No contracts match the current filters.
          </div>
        )}
      </div>
    </>
  );
}
