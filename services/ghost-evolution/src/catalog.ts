/**
 * Ghost Evolution — Feature Catalog
 *
 * The catalog defines the known required feature set for a complete GhostStack
 * deployment. The scanner checks each capability and marks it as present or absent.
 *
 * Required features map to specific services, contracts, or RPC probes.
 */

export interface FeatureDefinition {
  id:          string;
  name:        string;
  description: string;
  category:    "contracts" | "services" | "infrastructure" | "ai";
  /** HTTP endpoint to probe for liveness (GET /health) */
  probeUrl?:   string;
  /** Contract name to check in ghost-deployer artifacts */
  contractName?: string;
}

export const FEATURE_CATALOG: FeatureDefinition[] = [
  // ── Core Infrastructure ───────────────────────────────────────────────────
  { id: "l1-rpc",          name: "GhostChain L1 RPC",       category: "infrastructure", description: "L1 node is operational", probeUrl: "GHOST_L1_RPC" },
  { id: "l2-rpc",          name: "GhostL2 RPC",             category: "infrastructure", description: "L2 node is operational", probeUrl: "GHOST_L2_RPC" },
  { id: "l3-rpc",          name: "GhostL3 RPC",             category: "infrastructure", description: "L3 node is operational", probeUrl: "GHOST_L3_RPC" },

  // ── AI Services ───────────────────────────────────────────────────────────
  { id: "ghostbrain-core", name: "GhostBrain Core",         category: "ai",             description: "AI core at port 7900",    probeUrl: "http://127.0.0.1:7900" },
  { id: "ghostbrain-swarm",name: "GhostBrain Swarm",        category: "ai",             description: "AI swarm coordinator at port 7960", probeUrl: "http://127.0.0.1:7960" },
  { id: "ghost-deployer",  name: "Ghost Deployer",          category: "services",       description: "Autonomous deploy engine at port 7961", probeUrl: "http://127.0.0.1:7961" },
  { id: "ghost-evolution", name: "Ghost Evolution",         category: "services",       description: "Self-upgrade engine (this service)", probeUrl: "http://127.0.0.1:7962" },

  // ── Governance ────────────────────────────────────────────────────────────
  { id: "governance-service", name: "Governance Service",   category: "services",       description: "On-chain governance bridge", probeUrl: "http://127.0.0.1:7685" },
  { id: "ghostbrain-governor",name: "Ghost Governor AI",    category: "ai",             description: "AI governor at port 7930",  probeUrl: "http://127.0.0.1:7930" },

  // ── Treasury ──────────────────────────────────────────────────────────────
  { id: "treasury-engine", name: "Treasury Engine",         category: "services",       description: "Treasury engine at port 7683", probeUrl: "http://127.0.0.1:7683" },
  { id: "treasury-ai",     name: "Treasury AI",             category: "ai",             description: "AI treasury optimizer",    probeUrl: "http://127.0.0.1:7686" },

  // ── DeFi & Liquidity ──────────────────────────────────────────────────────
  { id: "liquidity-service", name: "Liquidity Service",     category: "services",       description: "Liquidity routing and LGE", probeUrl: "http://127.0.0.1:7687" },
  { id: "reward-distributor",name: "Reward Distributor",    category: "services",       description: "Reward distributor at port 7684", probeUrl: "http://127.0.0.1:7684" },

  // ── Contracts (checked via deployer artifact list) ────────────────────────
  { id: "contract-sovereign-treasury", name: "SovereignTreasuryEngine", category: "contracts", description: "On-chain treasury", contractName: "SovereignTreasuryEngine" },
  { id: "contract-ghost-governor",     name: "GhostChainGovernor",      category: "contracts", description: "On-chain governor", contractName: "GhostChainGovernor" },
  { id: "contract-wgst",               name: "WGST",                    category: "contracts", description: "Wrapped GST token", contractName: "WGST" },
  { id: "contract-gns",                name: "GNS Registry",            category: "contracts", description: "Ghost Name System", contractName: "GNSRegistry" },
  { id: "contract-mev-shield",         name: "GhostMEVShield",          category: "contracts", description: "MEV protection",   contractName: "GhostMEVShield" },
  { id: "contract-liquid-staking",     name: "GhostLiquidStaking",      category: "contracts", description: "gsGST liquid staking", contractName: "GhostLiquidStaking" },
  { id: "contract-da",                 name: "GhostDataAvailability",   category: "contracts", description: "DA layer",          contractName: "GhostDataAvailability" },
  { id: "contract-depin",              name: "GhostDePIN",              category: "contracts", description: "DePIN marketplace", contractName: "GhostDePIN" },
  { id: "contract-state-channel",      name: "GhostStateChannel",       category: "contracts", description: "L2 state channels",contractName: "GhostStateChannel" },
  { id: "contract-rwa",                name: "GhostRWA",                category: "contracts", description: "Real World Assets", contractName: "GhostRWA" },
  { id: "contract-nullifier",          name: "GhostNullifierRegistry",  category: "contracts", description: "ZK privacy",       contractName: "GhostNullifierRegistry" },
];
