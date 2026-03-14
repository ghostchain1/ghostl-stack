/**
 * GhostBrain Memory — Global Fix Memory
 *
 * Aggregates fix records from all cluster nodes.
 * Success rates are weighted-averaged across nodes so a fix that works
 * consistently across many servers gets promoted.
 */

import { appendFile, readFile, mkdir } from "node:fs/promises";
import { existsSync }                  from "node:fs";
import { join }                        from "node:path";

const MEMORY_DIR = process.env.MEMORY_DIR ?? "/tmp/ghostbrain-fed-memory";
const JOURNAL    = "fixes.ndjson";

export type GlobalActionType =
  | "restart"
  | "scale_memory"
  | "scale_cpu"
  | "reroute"
  | "throttle"
  | "alert"
  | "noop";

export interface GlobalFixRecord {
  problem:         string;
  actionType:      GlobalActionType;
  totalAttempts:   number;
  totalSuccesses:  number;
  successRate:     number;     // 0–1
  avgRecoveryMs:   number;
  nodesSeen:       string[];
  lastUpdatedAt:   number;
  confirmedAt?:    number;     // set when successRate > 0.8 and totalAttempts > 5
}

// key = problem description (normalised)
const _fixes = new Map<string, GlobalFixRecord>();

function normalise(problem: string): string {
  return problem.trim().toLowerCase().replace(/[0-9a-f-]{8,}/gi, "<id>");
}

async function ensureDir(): Promise<void> {
  if (!existsSync(MEMORY_DIR)) await mkdir(MEMORY_DIR, { recursive: true });
}

export async function globalRecordFix(
  nodeId:      string,
  problem:     string,
  actionType:  GlobalActionType,
  success:     boolean,
  recoveryMs:  number
): Promise<GlobalFixRecord> {
  const key = normalise(problem);
  let rec = _fixes.get(key);
  if (!rec) {
    rec = {
      problem:        key,
      actionType,
      totalAttempts:  0,
      totalSuccesses: 0,
      successRate:    0,
      avgRecoveryMs:  0,
      nodesSeen:      [],
      lastUpdatedAt:  Date.now(),
    };
    _fixes.set(key, rec);
  }

  rec.totalAttempts++;
  if (success) {
    rec.totalSuccesses++;
    rec.avgRecoveryMs = (rec.avgRecoveryMs * (rec.totalSuccesses - 1) + recoveryMs) / rec.totalSuccesses;
  }
  rec.successRate = rec.totalSuccesses / rec.totalAttempts;
  if (!rec.nodesSeen.includes(nodeId)) rec.nodesSeen.push(nodeId);
  rec.lastUpdatedAt = Date.now();
  if (rec.successRate > 0.8 && rec.totalAttempts >= 5) {
    rec.confirmedAt = rec.confirmedAt ?? Date.now();
  }

  await ensureDir();
  try {
    await appendFile(join(MEMORY_DIR, JOURNAL), JSON.stringify({ nodeId, ...rec }) + "\n", "utf8");
  } catch { /* non-fatal */ }
  return rec;
}

export async function hydrateFixMemory(): Promise<void> {
  await ensureDir();
  const p = join(MEMORY_DIR, JOURNAL);
  if (!existsSync(p)) return;
  try {
    const lines = (await readFile(p, "utf8")).split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const raw = JSON.parse(line) as GlobalFixRecord & { nodeId?: string };
        const { nodeId: nid, ...rec } = raw;
        const key = normalise(rec.problem);
        const existing = _fixes.get(key);
        // Keep the entry with more attempts (most up-to-date)
        if (!existing || rec.totalAttempts > existing.totalAttempts) {
          _fixes.set(key, rec);
          if (nid && !rec.nodesSeen.includes(nid)) rec.nodesSeen.push(nid);
        }
      } catch { /* skip */ }
    }
  } catch { /* unreadable */ }
}

export function lookupGlobalFix(problem: string): GlobalFixRecord | undefined {
  return _fixes.get(normalise(problem));
}

export function getAllGlobalFixes(minSuccessRate = 0): GlobalFixRecord[] {
  return [..._fixes.values()]
    .filter(r => r.successRate >= minSuccessRate)
    .sort((a, b) => b.successRate - a.successRate);
}

export function fixStats(): { total: number; confirmed: number; avgSuccessRate: number } {
  const all = [..._fixes.values()];
  const confirmed = all.filter(r => r.confirmedAt !== undefined).length;
  const avg = all.length ? all.reduce((s, r) => s + r.successRate, 0) / all.length : 0;
  return { total: all.length, confirmed, avgSuccessRate: avg };
}
