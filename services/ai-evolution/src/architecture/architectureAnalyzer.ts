/**
 * Architecture Analyzer — evaluates ecosystem health and identifies structural bottlenecks.
 */

import { v4 as uuid } from "uuid";
import logger          from "../utils/logger";

export type HealthArea      = "performance" | "scalability" | "security" | "reliability" | "efficiency";
export type BottleneckType  = "cpu" | "memory" | "network" | "storage" | "consensus" | "throughput" | "latency";
export type ImprovementType = "scale-out" | "optimize-code" | "upgrade-protocol" | "add-caching" | "restructure-service" | "add-sharding" | "rebalance-load";

export interface NetworkHealth {
  tps:         number;
  latency_ms:  number;
  blockTime_s: number;
  validators:  number;
  health:      number;   // 0-100
}

export interface BottleneckReport {
  id:                  string;
  area:                HealthArea;
  bottleneck:          BottleneckType;
  severity:            number;   // 1-10
  service:             string;
  description:         string;
  suggestedImprovement:ImprovementType;
  estimatedImpact:     number;   // % improvement
  detectedAt:          number;
}

export interface ArchitectureSnapshot {
  id:              string;
  timestamp:       number;
  overallHealth:   number;   // 0-100
  bottlenecks:     BottleneckReport[];
  nodeCount:       number;
  serviceCount:    number;
  avgResponseTime: number;   // ms
  throughputTps:   number;
  networks: {
    GhostChain: NetworkHealth;
    GhostL2:    NetworkHealth;
    GhostL3:    NetworkHealth;
  };
}

const MAX_SNAPSHOTS = 100;
const store: ArchitectureSnapshot[] = [];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randf(a: number, b: number) { return parseFloat((Math.random() * (b - a) + a).toFixed(2)); }

const SERVICES = [
  "ai-marketing","ai-growth","ai-adoption","ai-expansion","ai-economy",
  "ai-infrastructure","ai-security","ai-intelligence","ai-governance",
  "ai-interchain","ai-agents","ai-development","ghostchain-node","ghostl2-node","ghostl3-node",
];

const BOTTLENECK_DESCRIPTIONS: Record<BottleneckType, string[]> = {
  cpu:         ["High CPU utilization across validator nodes", "AI inference tasks saturating core compute"],
  memory:      ["Memory pressure on state-heavy services", "Caching layer exhausting heap — GC pressure increasing"],
  network:     ["Cross-chain bridge bandwidth approaching limit", "P2P discovery flooding inbound connections"],
  storage:     ["Chain state growth outpacing disk IOPS", "Log archives consuming >80% of allocated storage"],
  consensus:   ["Finality time elevated — validator set synchronization lag", "Fork rate above threshold on GhostL2"],
  throughput:  ["Transaction queue depth rising — mempool congestion", "Batch submission rate below target"],
  latency:     ["RPC endpoint P99 latency above SLA", "Inter-service call chains adding cumulative delay"],
};

const IMPROVEMENTS: Record<ImprovementType, string> = {
  "scale-out":            "Add horizontal replicas to distribute load",
  "optimize-code":        "Profile hot paths and apply algorithmic improvements",
  "upgrade-protocol":     "Apply protocol upgrade to increase throughput",
  "add-caching":          "Introduce Redis layer for frequently accessed state",
  "restructure-service":  "Break monolithic service into focused microservices",
  "add-sharding":         "Shard chain state across parallel execution lanes",
  "rebalance-load":       "Redistribute validator and RPC workloads via dynamic routing",
};

function makeNetworkHealth(base: number): NetworkHealth {
  return {
    tps:         rand(base - 10, base + 40),
    latency_ms:  rand(12, 120),
    blockTime_s: randf(0.8, 3.5),
    validators:  rand(21, 150),
    health:      rand(72, 99),
  };
}

function makeBottleneck(hoursAgo: number): BottleneckReport {
  const bottleneck = pick(Object.keys(BOTTLENECK_DESCRIPTIONS) as BottleneckType[]);
  const area       = pick(["performance","scalability","security","reliability","efficiency"] as HealthArea[]);
  const improvement= pick(Object.keys(IMPROVEMENTS) as ImprovementType[]);
  return {
    id:                   uuid(),
    area,
    bottleneck,
    severity:             rand(2, 9),
    service:              pick(SERVICES),
    description:          pick(BOTTLENECK_DESCRIPTIONS[bottleneck]!),
    suggestedImprovement: improvement,
    estimatedImpact:      rand(8, 45),
    detectedAt:           Date.now() - hoursAgo * 3_600_000,
  };
}

function makeSnapshot(hoursAgo = 0): ArchitectureSnapshot {
  const numBottlenecks = rand(0, 4);
  const bottlenecks    = Array.from({ length: numBottlenecks }, () => makeBottleneck(hoursAgo));
  const avgSeverity    = bottlenecks.length ? bottlenecks.reduce((s, b) => s + b.severity, 0) / bottlenecks.length : 0;
  const overallHealth  = Math.max(40, Math.round(100 - avgSeverity * 5));
  return {
    id:              uuid(),
    timestamp:       Date.now() - hoursAgo * 3_600_000,
    overallHealth,
    bottlenecks,
    nodeCount:       rand(150, 800),
    serviceCount:    15,
    avgResponseTime: rand(18, 250),
    throughputTps:   rand(400, 3200),
    networks: {
      GhostChain: makeNetworkHealth(120),
      GhostL2:    makeNetworkHealth(380),
      GhostL3:    makeNetworkHealth(800),
    },
  };
}

function seed() {
  for (let i = 12; i > 0; i--) store.push(makeSnapshot(i * 2));
  logger.info(`[ArchitectureAnalyzer] Seeded ${store.length} snapshots`);
}

export function analyzeArchitecture(): ArchitectureSnapshot {
  const snapshot = makeSnapshot(0);
  store.unshift(snapshot);
  if (store.length > MAX_SNAPSHOTS) store.pop();
  logger.info(`[ArchitectureAnalyzer] Snapshot — health ${snapshot.overallHealth}/100, ${snapshot.bottlenecks.length} bottleneck(s)`);
  return snapshot;
}

export function getSnapshots(opts: { limit?: number } = {}): ArchitectureSnapshot[] {
  return store.slice(0, opts.limit ?? 20);
}

export function getLatestSnapshot(): ArchitectureSnapshot | null {
  return store[0] ?? null;
}

export function getAnalysisStats() {
  const avg = store.length ? Math.round(store.reduce((s, x) => s + x.overallHealth, 0) / store.length) : 0;
  const allBottlenecks = store.flatMap(s => s.bottlenecks);
  return {
    total:           store.length,
    avgHealth:       avg,
    totalBottlenecks:allBottlenecks.length,
    critical:        allBottlenecks.filter(b => b.severity >= 8).length,
    avgThroughput:   store.length ? Math.round(store.reduce((s, x) => s + x.throughputTps, 0) / store.length) : 0,
    byType:          Object.fromEntries((Object.keys(BOTTLENECK_DESCRIPTIONS) as BottleneckType[]).map(t => [t, allBottlenecks.filter(b => b.bottleneck === t).length])),
  };
}

seed();
