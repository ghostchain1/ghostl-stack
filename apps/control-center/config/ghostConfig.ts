// ── GhostStack C3 — Central Configuration ─────────────────────────────────────
// Defines all AI engine endpoints, chain RPCs, refresh intervals, security roles,
// and WebSocket configuration. Override any value via environment variables.

export const C3_CONFIG = {
  // ── Core SCP (Super Control Plane) ───────────────────────────────────────────
  scp: process.env.NEXT_PUBLIC_SCP_URL ?? "http://localhost:9500",

  // ── AI Engine Portfolio ───────────────────────────────────────────────────────
  engines: {
    aims:  { url: process.env.NEXT_PUBLIC_AIMS_URL  ?? "http://localhost:9970", label: "AI Marketing Engine",           port: 9970, group: "growth"     },
    vge:   { url: process.env.NEXT_PUBLIC_VGE_URL   ?? "http://localhost:9971", label: "Viral Growth Engine",           port: 9971, group: "growth"     },
    aae:   { url: process.env.NEXT_PUBLIC_AAE_URL   ?? "http://localhost:9972", label: "Adoption Accelerator Engine",   port: 9972, group: "growth"     },
    gee:   { url: process.env.NEXT_PUBLIC_GEE_URL   ?? "http://localhost:9973", label: "Global Expansion Engine",       port: 9973, group: "growth"     },
    ghie:  { url: process.env.NEXT_PUBLIC_GHIE_URL  ?? "http://localhost:9974", label: "GhostEconomy Engine",           port: 9974, group: "economy"    },
    gie:   { url: process.env.NEXT_PUBLIC_GIE_URL   ?? "http://localhost:9975", label: "Governance Impact Engine",      port: 9975, group: "governance" },
    aide:  { url: process.env.NEXT_PUBLIC_AIDE_URL  ?? "http://localhost:9976", label: "AI Infra & DevOps Engine",      port: 9976, group: "infra"      },
    ase:   { url: process.env.NEXT_PUBLIC_ASE_URL   ?? "http://localhost:9977", label: "AI Security Engine",            port: 9977, group: "security"   },
    gaan:  { url: process.env.NEXT_PUBLIC_GAAN_URL  ?? "http://localhost:9981", label: "AI Agent Network",              port: 9981, group: "agents"     },
    ade:   { url: process.env.NEXT_PUBLIC_ADE_URL   ?? "http://localhost:9982", label: "AI Development Engine",         port: 9982, group: "dev"        },
    see:   { url: process.env.NEXT_PUBLIC_SEE_URL   ?? "http://localhost:9983", label: "Self-Evolution Engine",         port: 9983, group: "evolution"  },
    pne:   { url: process.env.NEXT_PUBLIC_PNE_URL   ?? "http://localhost:9984", label: "Planetary Network Engine",      port: 9984, group: "planetary"  },
    ine:   { url: process.env.NEXT_PUBLIC_INE_URL   ?? "http://localhost:9985", label: "Interplanetary Network Engine", port: 9985, group: "planetary"  },
    hcl:   { url: process.env.NEXT_PUBLIC_HCL_URL   ?? "http://localhost:9986", label: "Hypervisor Control Layer",      port: 9986, group: "infra"      },
    are:   { url: process.env.NEXT_PUBLIC_ARE_URL   ?? "http://localhost:9987", label: "Autonomous Revenue Engine",     port: 9987, group: "economy"    },
    aio:   { url: process.env.NEXT_PUBLIC_AIO_URL   ?? "http://localhost:9988", label: "AI Operations Center",          port: 9988, group: "ops"        },
    gcl:   { url: process.env.NEXT_PUBLIC_GCL_URL   ?? "http://localhost:9989", label: "GhostBrain Cognitive Layer",    port: 9989, group: "cognitive"  },
  },

  // ── Blockchain chains ─────────────────────────────────────────────────────────
  chains: {
    ghostchain: {
      name:    "GhostChain (L1)",
      chainId: 1337,
      rpc:     process.env.NEXT_PUBLIC_GHOSTCHAIN_RPC ?? "http://localhost:8545",
      symbol:  "GHOST",
      color:   "#7c3aed",
    },
    ghostl2: {
      name:    "GhostL2 (L2)",
      chainId: 1338,
      rpc:     process.env.NEXT_PUBLIC_GHOSTL2_RPC ?? "http://localhost:8546",
      symbol:  "GST",
      color:   "#10b981",
    },
    ghostl3: {
      name:    "GhostL3 (L3)",
      chainId: 1339,
      rpc:     process.env.NEXT_PUBLIC_GHOSTL3_RPC ?? "http://localhost:8547",
      symbol:  "GST",
      color:   "#f59e0b",
    },
  },

  // ── WebSocket (live log stream from SCP) ──────────────────────────────────────
  ws: { url: process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:9500/ws" },

  // ── Access roles ──────────────────────────────────────────────────────────────
  roles: ["admin", "operator", "developer", "viewer"] as const,

  // ── Auto-refresh intervals (ms) ───────────────────────────────────────────────
  refreshIntervals: {
    overview:       15_000,
    chains:         10_000,
    validators:     20_000,
    nodes:          30_000,
    ai:             15_000,
    revenue:        30_000,
    infrastructure: 30_000,
    governance:     60_000,
    aiops:          15_000,
  },

  // ── Treasury constants ────────────────────────────────────────────────────────
  treasury: {
    autoDistributeThresholdUSD: 10_000,
    splitTreasuryPct:    40,
    splitValidatorsPct:  30,
    splitEcosystemPct:   30,
  },
} as const;

export type C3Role     = typeof C3_CONFIG.roles[number];
export type C3EngineId = keyof typeof C3_CONFIG.engines;
export type C3ChainId  = keyof typeof C3_CONFIG.chains;
