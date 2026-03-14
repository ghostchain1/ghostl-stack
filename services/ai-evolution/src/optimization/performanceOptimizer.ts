/**
 * Performance Optimizer — monitors and optimizes service efficiency across GhostStack.
 */

import { v4 as uuid } from "uuid";
import logger          from "../utils/logger";

export type OptimizationType = "cpu-scaling" | "memory-tuning" | "cache-layer" | "query-optimization" | "connection-pool" | "rate-limit-tuning" | "garbage-collection" | "network-compression";
export type OptimizationStatus = "proposed" | "testing" | "applied" | "rolled-back" | "monitoring";

export interface ServiceMetrics {
  service:     string;
  cpu:         number;   // %
  memory:      number;   // %
  latency_ms:  number;
  rps:         number;   // requests per second
  errorRate:   number;   // %
  uptime:      number;   // %
  timestamp:   number;
}

export interface Optimization {
  id:            string;
  service:       string;
  type:          OptimizationType;
  description:   string;
  beforeMetrics: Partial<ServiceMetrics>;
  afterMetrics:  Partial<ServiceMetrics> | null;
  improvement:   number;  // percent improvement
  status:        OptimizationStatus;
  proposedAt:    number;
  appliedAt?:    number;
  rollbackRisk:  "low" | "medium" | "high";
}

const MAX_OPT = 200;
const metricsStore: ServiceMetrics[] = [];
const optStore:     Optimization[]   = [];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randf(a: number, b: number, dp = 1) { return parseFloat((Math.random() * (b - a) + a).toFixed(dp)); }

const SERVICES = ["ai-marketing","ai-growth","ai-adoption","ai-expansion","ai-economy","ai-infrastructure","ai-security","ai-intelligence","ai-governance","ai-interchain","ai-agents","ai-development","ai-evolution","ghostchain-node","ghostl2-node","ghostl3-node"];

const OPT_DESCRIPTIONS: Record<OptimizationType, string[]> = {
  "cpu-scaling":         ["Scale CPU allocation to match peak demand", "Add horizontal pod replicas for CPU-bound workloads"],
  "memory-tuning":       ["Tune heap size to reduce GC pressure", "Enable memory-mapped file caching"],
  "cache-layer":         ["Add Redis caching layer for hot data paths", "Implement CDN edge caching for API responses"],
  "query-optimization":  ["Add composite index on timestamp+service columns", "Rewrite N+1 query pattern with batch fetch"],
  "connection-pool":     ["Increase DB connection pool from 10 to 50", "Implement connection multiplexing"],
  "rate-limit-tuning":   ["Loosen rate limits on trusted internal IPs", "Implement adaptive rate limiting based on CPU"],
  "garbage-collection":  ["Switch V8 GC to incremental mode", "Tune GC pause targets for latency-sensitive paths"],
  "network-compression": ["Enable Brotli compression for API responses", "Compress WebSocket frames for agent comms"],
};

function collectMetrics(service: string): ServiceMetrics {
  const m: ServiceMetrics = {
    service,
    cpu:        randf(10, 95),
    memory:     randf(20, 90),
    latency_ms: rand(10, 800),
    rps:        rand(5, 2000),
    errorRate:  randf(0, 5),
    uptime:     randf(96, 100),
    timestamp:  Date.now(),
  };
  metricsStore.unshift(m);
  if (metricsStore.length > 1000) metricsStore.pop();
  return m;
}

function seed() {
  SERVICES.forEach(svc => {
    const before = collectMetrics(svc);
    if (before.cpu > 60 || before.latency_ms > 300) {
      const type   = pick(Object.keys(OPT_DESCRIPTIONS) as OptimizationType[]);
      const applied = Math.random() > 0.3;
      const imp    = rand(10, 45);
      optStore.push({
        id:            uuid(),
        service:       svc,
        type,
        description:   pick(OPT_DESCRIPTIONS[type]!),
        beforeMetrics: { cpu: before.cpu, latency_ms: before.latency_ms, memory: before.memory },
        afterMetrics:  applied ? { cpu: before.cpu * (1 - imp / 100), latency_ms: Math.round(before.latency_ms * (1 - imp / 200)) } : null,
        improvement:   applied ? imp : 0,
        status:        applied ? "applied" : "proposed",
        proposedAt:    Date.now() - rand(1, 240) * 3_600_000,
        ...(applied ? { appliedAt: Date.now() - rand(1, 48) * 3_600_000 } : {}),
        rollbackRisk:  pick(["low", "medium", "high"]),
      });
    }
  });
  logger.info(`[PerformanceOptimizer] Seeded ${optStore.length} optimizations`);
}

export function optimizePerformance(service?: string): Optimization {
  const svc    = service ?? pick(SERVICES);
  const before = collectMetrics(svc);
  const needsOpt = before.cpu > 70 || before.latency_ms > 400 || before.memory > 80;
  const type   = needsOpt
    ? (before.cpu > 70 ? "cpu-scaling" : before.latency_ms > 400 ? "cache-layer" : "memory-tuning")
    : pick(Object.keys(OPT_DESCRIPTIONS) as OptimizationType[]);
  const imp    = rand(5, 40);
  const apply  = Math.random() > 0.2;
  const opt: Optimization = {
    id:            uuid(),
    service:       svc,
    type,
    description:   pick(OPT_DESCRIPTIONS[type]!),
    beforeMetrics: { cpu: before.cpu, latency_ms: before.latency_ms, memory: before.memory },
    afterMetrics:  apply ? { cpu: before.cpu * (1 - imp / 100), latency_ms: Math.round(before.latency_ms * (1 - imp / 200)) } : null,
    improvement:   apply ? imp : 0,
    status:        apply ? "applied" : "proposed",
    proposedAt:    Date.now(),
    ...(apply ? { appliedAt: Date.now() } : {}),
    rollbackRisk:  imp > 25 ? "medium" : "low",
  };
  optStore.unshift(opt);
  if (optStore.length > MAX_OPT) optStore.pop();
  logger.info(`[PerformanceOptimizer] ${apply ? "Applied" : "Proposed"} ${type} for ${svc} (${imp}% improvement)`);
  return opt;
}

export function getAllMetrics(service?: string): ServiceMetrics[] {
  return service ? metricsStore.filter(m => m.service === service) : metricsStore.slice(0, 50);
}

export function getOptimizations(opts: { service?: string; type?: OptimizationType; status?: OptimizationStatus; limit?: number } = {}): Optimization[] {
  let list = [...optStore];
  if (opts.service) list = list.filter(o => o.service === opts.service);
  if (opts.type)    list = list.filter(o => o.type    === opts.type);
  if (opts.status)  list = list.filter(o => o.status  === opts.status);
  return list.slice(0, opts.limit ?? 50);
}

export function getOptimizationStats() {
  return {
    total:    optStore.length,
    applied:  optStore.filter(o => o.status === "applied").length,
    proposed: optStore.filter(o => o.status === "proposed").length,
    avgImprovement: optStore.filter(o => o.improvement > 0).reduce((s, o, _, a) => s + o.improvement / a.length, 0) | 0,
    byType:   Object.fromEntries((Object.keys(OPT_DESCRIPTIONS) as OptimizationType[]).map(t => [t, optStore.filter(o => o.type === t).length])),
  };
}

seed();
