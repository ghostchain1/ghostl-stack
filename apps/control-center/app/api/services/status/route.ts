// API: All services health status
import { NextResponse } from "next/server";

interface ServiceDef {
  name:  string;
  port:  number;
  group: string;
  path:  string;
}

// Canonical service list — key services to probe
const SERVICES: ServiceDef[] = [
  { name: "ghostbrain-core",          port: 7900,  group: "ai",           path: "/health" },
  { name: "l3-fee-collector",         port: 7681,  group: "economy",      path: "/health" },
  { name: "l2-revenue-aggregator",    port: 7682,  group: "economy",      path: "/health" },
  { name: "treasury-engine",          port: 7683,  group: "economy",      path: "/health" },
  { name: "reward-distributor",       port: 7684,  group: "economy",      path: "/health" },
  { name: "hyper-ghost-governor",     port: 7685,  group: "governance",   path: "/health" },
  { name: "compliance-service",       port: 8090,  group: "security",     path: "/health" },
  { name: "ghost-rpc-proxy",          port: 9000,  group: "chain",        path: "/health" },
  { name: "gns-api",                  port: 7704,  group: "gns",          path: "/health" },
  { name: "block-index-service",      port: 7794,  group: "indexer",      path: "/health" },
  { name: "global-search-service",    port: 7800,  group: "search",       path: "/health" },
  { name: "auth-service",             port: 7705,  group: "auth",         path: "/health" },
  { name: "rbac-service",             port: 7706,  group: "auth",         path: "/health" },
  { name: "notifications-service",    port: 7810,  group: "ops",          path: "/health" },
  { name: "bridge-service",           port: 7702,  group: "bridge",       path: "/health" },
  { name: "contract-registry-service",port: 7703,  group: "contracts",    path: "/health" },
  { name: "governance-service",       port: 7720,  group: "governance",   path: "/health" },
  { name: "validator-service",        port: 7795,  group: "validators",   path: "/health" },
  { name: "ai-marketing-engine",      port: 9970,  group: "growth",       path: "/health" },
  { name: "viral-growth-engine",      port: 9971,  group: "growth",       path: "/health" },
  { name: "ghost-economy-engine",     port: 9974,  group: "economy",      path: "/health" },
  { name: "governance-impact-engine", port: 9975,  group: "governance",   path: "/health" },
  { name: "ai-infra-devops",          port: 9976,  group: "infra",        path: "/health" },
  { name: "ai-security-engine",       port: 9977,  group: "security",     path: "/health" },
  { name: "ai-agent-network",         port: 9981,  group: "agents",       path: "/health" },
  { name: "self-evolution-engine",    port: 9983,  group: "evolution",    path: "/health" },
  { name: "autonomous-revenue-engine",port: 9987,  group: "economy",      path: "/health" },
  { name: "ai-ops-center",            port: 9988,  group: "ops",          path: "/health" },
  { name: "ghostbrain-cognitive",     port: 9989,  group: "cognitive",    path: "/health" },
  { name: "mempool-service",          port: 7710,  group: "chain",        path: "/health" },
  { name: "chain-status-service",     port: 7701,  group: "chain",        path: "/health" },
  { name: "staking-service",          port: 7712,  group: "validators",   path: "/health" },
  { name: "swap-service",             port: 7713,  group: "defi",         path: "/health" },
  { name: "ghostx-api",               port: 7796,  group: "defi",         path: "/health" },
];

async function probe(svc: ServiceDef) {
  const t0 = Date.now();
  const base = process.env[`SERVICE_${svc.name.toUpperCase().replace(/-/g,"_")}_URL`]
    ?? `http://localhost:${svc.port}`;
  try {
    const res = await fetch(`${base}${svc.path}`, {
      signal: AbortSignal.timeout(2_500),
      cache:  "no-store",
    });
    const latency = Date.now() - t0;
    const status  = res.ok ? "online" : "degraded";
    let version: string | undefined;
    try {
      const j = await res.json() as Record<string, unknown>;
      version = typeof j.version === "string" ? j.version : undefined;
    } catch { /* ignore */ }
    return { name: svc.name, port: svc.port, group: svc.group, status, latency, version };
  } catch {
    return { name: svc.name, port: svc.port, group: svc.group, status: "offline", latency: null, version: undefined };
  }
}

export async function GET() {
  // Probe in parallel, batch of up to 10 at a time to avoid contention  
  const BATCH = 10;
  const results = [];
  for (let i = 0; i < SERVICES.length; i += BATCH) {
    const batch = await Promise.all(SERVICES.slice(i, i + BATCH).map(probe));
    results.push(...batch);
  }
  return NextResponse.json(results);
}
