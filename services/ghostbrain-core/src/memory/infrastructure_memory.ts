/**
 * GhostBrain Core — Infrastructure Memory
 *
 * Tracks system state snapshots over time:
 * - VM pressure history
 * - container restart counts
 * - memory spikes
 * - CPU saturation events
 * - disk IO saturation
 *
 * Rolling circular buffer (hot) + disk archive (cold).
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type InfraLayer = "hypervisor" | "vm" | "container" | "service" | "chain";

export type SeverityLevel = "info" | "warning" | "critical";

export interface InfraSnapshot {
  ts:         number;          // epoch ms
  layer:      InfraLayer;
  resourceId: string;          // VM name / container id / service name
  cpuPct:     number;          // 0–100
  memPct:     number;          // 0–100
  diskIoPct:  number;          // 0–100 (estimated)
  netMbps:    number;
  restarts:   number;          // cumulative restart count
  healthy:    boolean;
  severity:   SeverityLevel;
  meta:       Record<string, unknown>;
}

// Safety thresholds — GhostBrain enforces these for crash prevention
export const THRESHOLDS = {
  CPU_WARN:    85,
  CPU_CRIT:    90,
  MEM_WARN:    80,
  MEM_CRIT:    85,
  DISK_IO_CRIT: 90,
} as const;

const RING_SIZE = 2000;                       // max hot entries
const ring: InfraSnapshot[] = [];
let ringHead = 0;

let MEMORY_DIR    = process.env.GHOSTBRAIN_MEMORY_DIR ?? "/tmp/ghostbrain-memory";
let INFRA_JOURNAL = join(MEMORY_DIR, "infra.ndjson");

function ensureDir() {
  mkdirSync(MEMORY_DIR, { recursive: true });
}

export function hydrateInfraMemory(dir?: string): void {
  if (dir) {
    MEMORY_DIR    = dir;
    INFRA_JOURNAL = join(dir, "infra.ndjson");
  }
  ensureDir();
  if (!existsSync(INFRA_JOURNAL)) return;
  try {
    const lines = readFileSync(INFRA_JOURNAL, "utf8")
      .split("\n").filter(Boolean).slice(-RING_SIZE);
    for (const line of lines) {
      try { pushToRing(JSON.parse(line) as InfraSnapshot, false); }
      catch { /* skip */ }
    }
  } catch { /* start fresh */ }
}

function computeSeverity(snap: Omit<InfraSnapshot, "severity">): SeverityLevel {
  if (snap.cpuPct >= THRESHOLDS.CPU_CRIT || snap.memPct >= THRESHOLDS.MEM_CRIT || snap.diskIoPct >= THRESHOLDS.DISK_IO_CRIT) return "critical";
  if (snap.cpuPct >= THRESHOLDS.CPU_WARN || snap.memPct >= THRESHOLDS.MEM_WARN) return "warning";
  return "info";
}

function pushToRing(snap: InfraSnapshot, persist: boolean): void {
  if (ring.length < RING_SIZE) {
    ring.push(snap);
  } else {
    ring[ringHead % RING_SIZE] = snap;
    ringHead++;
  }
  if (persist) {
    ensureDir();
    appendFileSync(INFRA_JOURNAL, JSON.stringify(snap) + "\n");
  }
}

/** Record a new infrastructure snapshot. Returns severity. */
export function recordInfraSnapshot(
  snap: Omit<InfraSnapshot, "severity">,
): SeverityLevel {
  const severity = computeSeverity(snap);
  pushToRing({ ...snap, severity }, true);
  return severity;
}

/** No-arg: returns snapshots grouped by resourceId (for pattern analysis). */
export function getInfraHistory(): Record<string, InfraSnapshot[]>;
/** With resourceId/layer args: returns a flat filtered array. */
export function getInfraHistory(resourceId: string | undefined, layer?: InfraLayer, limitMs?: number): InfraSnapshot[];
export function getInfraHistory(
  resourceId?: string,
  layer?: InfraLayer,
  limitMs = 3_600_000,
): InfraSnapshot[] | Record<string, InfraSnapshot[]> {
  const cutoff = Date.now() - limitMs;
  if (arguments.length === 0) {
    // 0-arg call: return grouped by resourceId
    const grouped: Record<string, InfraSnapshot[]> = {};
    for (const s of ring) {
      if (s.ts < cutoff) continue;
      if (!grouped[s.resourceId]) grouped[s.resourceId] = [];
      grouped[s.resourceId].push(s);
    }
    return grouped;
  }
  return ring.filter(s => {
    if (s.ts < cutoff) return false;
    if (resourceId && s.resourceId !== resourceId) return false;
    if (layer && s.layer !== layer) return false;
    return true;
  });
}

/** Aggregate stats for a resource over the look-back window. */
export function resourceStats(resourceId: string, limitMs = 3_600_000) {
  const snaps = getInfraHistory(resourceId, undefined, limitMs);
  if (!snaps.length) return null;
  const avgCpu  = snaps.reduce((a, s) => a + s.cpuPct, 0) / snaps.length;
  const peakCpu = Math.max(...snaps.map(s => s.cpuPct));
  const avgMem  = snaps.reduce((a, s) => a + s.memPct, 0) / snaps.length;
  const peakMem = Math.max(...snaps.map(s => s.memPct));
  const crits   = snaps.filter(s => s.severity === "critical").length;
  return { resourceId, snaps: snaps.length, avgCpu, peakCpu, avgMem, peakMem, critEvents: crits };
}

export function infraSummary() {
  const byLayer: Partial<Record<InfraLayer, number>> = {};
  const critCount = ring.filter(s => s.severity === "critical").length;
  for (const s of ring) byLayer[s.layer] = (byLayer[s.layer] ?? 0) + 1;
  return { total: ring.length, critEvents: critCount, byLayer };
}
