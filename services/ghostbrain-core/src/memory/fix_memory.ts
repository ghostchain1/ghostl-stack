/**
 * GhostBrain Core — Fix Memory
 *
 * Remembers remediation actions that succeeded, along with their
 * success rates and applicability conditions.
 *
 * Example:
 *   problem:     "validator_oom_kill"
 *   solution:    "restart + increase memory by 512MB"
 *   successRate: 0.98
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface FixRecord {
  id?:           string;   // problem key (normalized)
  problem:       string;   // human-readable problem description
  solution:      string;   // action taken
  actionType:    string;   // e.g. "restart", "scale_memory", "throttle", "reroute"
  params:        Record<string, unknown>;  // action parameters
  successCount?: number;
  failureCount?: number;
  successRate:   number;  // recomputed: successCount / (successCount + failureCount)
  avgRecoveryMs?: number; // average time to recovery
  firstUsed?:    number;
  lastUsed?:     number;
}

const fixes = new Map<string, FixRecord>();
let MEMORY_DIR  = process.env.GHOSTBRAIN_MEMORY_DIR ?? "/tmp/ghostbrain-memory";
let FIX_JOURNAL = join(MEMORY_DIR, "fixes.ndjson");

function ensureDir() { mkdirSync(MEMORY_DIR, { recursive: true }); }

function normalizeKey(problem: string): string {
  return problem.toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 64);
}

export function hydrateFixMemory(dir?: string): void {
  if (dir) {
    MEMORY_DIR  = dir;
    FIX_JOURNAL = join(dir, "fixes.ndjson");
  }
  ensureDir();
  if (!existsSync(FIX_JOURNAL)) return;
  try {
    const lines = readFileSync(FIX_JOURNAL, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const rec = JSON.parse(line) as FixRecord;
        const recId    = rec.id ?? normalizeKey(rec.problem);
        const existing = fixes.get(recId);
        if (!existing || (rec.lastUsed ?? 0) > (existing.lastUsed ?? 0)) {
          fixes.set(recId, { ...rec, id: recId });
        }
      } catch { /* skip */ }
    }
  } catch { /* start fresh */ }
}

/** Record the result of a fix attempt. */
export function recordFixResult(
  problem: string,
  solution: string,
  actionType: string,
  params: Record<string, unknown>,
  success: boolean,
  recoveryMs: number,
): FixRecord {
  ensureDir();
  const id = normalizeKey(problem);
  const now = Date.now();
  const existing = fixes.get(id);
  const sc = (existing?.successCount ?? 0) + (success ? 1 : 0);
  const fc = (existing?.failureCount ?? 0) + (success ? 0 : 1);
  const total = sc + fc;
  const rec: FixRecord = {
    id,
    problem,
    solution: success ? solution : (existing?.solution ?? solution),
    actionType: success ? actionType : (existing?.actionType ?? actionType),
    params: success ? params : (existing?.params ?? params),
    successCount: sc,
    failureCount: fc,
    successRate: total > 0 ? sc / total : 0,
    avgRecoveryMs: existing
      ? Math.round(((existing.avgRecoveryMs ?? 0) * (total - 1) + recoveryMs) / total)
      : recoveryMs,
    firstUsed: existing?.firstUsed ?? now,
    lastUsed: now,
  };
  fixes.set(id, rec);
  appendFileSync(FIX_JOURNAL, JSON.stringify(rec) + "\n");
  return rec;
}

/** Look up the best known fix for a problem. */
export function lookupFix(problem: string): FixRecord | null | undefined {
  return fixes.get(normalizeKey(problem));
}

/** Alias for recordFixResult — for mock-compatible imports. */
export const recordFix = recordFixResult;

/** Return all known fixes, sorted by success rate descending. */
export function getAllFixes(): FixRecord[] {
  return [...fixes.values()].sort((a, b) => b.successRate - a.successRate);
}

export function fixMemoryStats() {
  const all = [...fixes.values()];
  const avgRate = all.length ? all.reduce((s, f) => s + f.successRate, 0) / all.length : 0;
  return { totalFixes: all.length, avgSuccessRate: avgRate };
}
