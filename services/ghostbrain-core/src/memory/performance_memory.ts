/**
 * GhostBrain Core — Performance Memory
 *
 * Tracks optimization history per resource:
 * - CPU spike patterns + optimal limits applied
 * - Memory tuning events
 * - Load balancing outcomes
 * - Throughput improvements
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type OptimizationType =
  | "cpu_limit"
  | "memory_limit"
  | "replica_scale"
  | "load_balance"
  | "disk_cache"
  | "throttle"
  | "reroute";

export interface PerfRecord {
  ts:           number;
  resourceId:   string;          // container/service/VM id
  optType:      OptimizationType;
  before:       Record<string, number>; // metric snapshot before action
  after:        Record<string, number>; // metric snapshot after action
  improvement:  number;                 // positive = better, negative = regression
  note:         string;
}

// Rolling store: last N records per resourceId
const MAX_PER_RESOURCE = 200;
const store = new Map<string, PerfRecord[]>();

let MEMORY_DIR   = process.env.GHOSTBRAIN_MEMORY_DIR ?? "/tmp/ghostbrain-memory";
let PERF_JOURNAL = join(MEMORY_DIR, "performance.ndjson");

function ensureDir() { mkdirSync(MEMORY_DIR, { recursive: true }); }

export function hydratePerfMemory(dir?: string): void {
  if (dir) {
    MEMORY_DIR   = dir;
    PERF_JOURNAL = join(dir, "performance.ndjson");
  }
  ensureDir();
  if (!existsSync(PERF_JOURNAL)) return;
  try {
    const lines = readFileSync(PERF_JOURNAL, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try { pushRecord(JSON.parse(line) as PerfRecord, false); }
      catch { /* skip */ }
    }
  } catch { /* start fresh */ }
}

function pushRecord(rec: PerfRecord, persist: boolean): void {
  const bucket = store.get(rec.resourceId) ?? [];
  bucket.push(rec);
  if (bucket.length > MAX_PER_RESOURCE) bucket.splice(0, bucket.length - MAX_PER_RESOURCE);
  store.set(rec.resourceId, bucket);
  if (persist) {
    ensureDir();
    appendFileSync(PERF_JOURNAL, JSON.stringify(rec) + "\n");
  }
}

export function recordOptimization(rec: Omit<PerfRecord, "ts">): PerfRecord {
  const full: PerfRecord = { ts: Date.now(), ...rec };
  pushRecord(full, true);
  return full;
}

export function getPerfHistory(
  resourceId: string,
  limitMs = 86_400_000,   // default: last 24 hours
): PerfRecord[] {
  const cutoff = Date.now() - limitMs;
  return (store.get(resourceId) ?? []).filter(r => r.ts >= cutoff);
}

/**
 * Derive the best known configuration for a resource by averaging top
 * improvements of a given optimization type.
 */
export function bestConfig(
  resourceId: string,
  optType: OptimizationType,
): Record<string, number> | null {
  const records = (store.get(resourceId) ?? [])
    .filter(r => r.optType === optType && r.improvement > 0)
    .sort((a, b) => b.improvement - a.improvement)
    .slice(0, 5);
  if (!records.length) return null;
  const merged: Record<string, number> = {};
  for (const rec of records) {
    for (const [k, v] of Object.entries(rec.after)) {
      merged[k] = (merged[k] ?? 0) + v / records.length;
    }
  }
  return merged;
}

export function perfStats() {
  let total = 0;
  let totalImprovement = 0;
  for (const recs of store.values()) {
    total += recs.length;
    totalImprovement += recs.reduce((s, r) => s + r.improvement, 0);
  }
  return { resources: store.size, totalRecords: total, avgImprovement: total ? totalImprovement / total : 0 };
}
