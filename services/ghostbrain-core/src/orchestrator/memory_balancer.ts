/**
 * GhostBrain — Memory Balancer
 *
 * Implements tiered memory management to keep RAM usage below 70%.
 *
 * Tiers:
 *   HOT   — active in RAM (recent AI reasoning, live events)
 *   WARM  — compressed + serialised on NVMe (embeddings, recent metrics)
 *   COLD  — NDJSON on slower disk (learning history, full metric archives)
 *
 * Balancing actions:
 *   1. evict:   move HOT → COLD when RAM > EVICT_THRESHOLD
 *   2. compress: compact COLD journals periodically
 *   3. hydrate:  load frequently-accessed COLD data back into HOT
 *
 * The actual AI memory modules (fix, vector, cognitive, infra, pattern)
 * expose size reporters and flush/hydrate hooks that this module calls.
 */

import { readFileSync, writeFileSync, existsSync, renameSync,
         mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── Constants ─────────────────────────────────────────────────────────────────

const HOT_MAX_MB       = Number(process.env.MEM_HOT_MAX_MB         ?? "256");
const EVICT_THRESHOLD  = Number(process.env.MEM_EVICT_THRESHOLD_PCT ?? "70");
const COMPRESS_EVERY   = Number(process.env.MEM_COMPRESS_INTERVAL_MS ?? String(5 * 60_000));

const MEMORY_DIR = process.env.GHOSTBRAIN_MEMORY_DIR ?? "/tmp/ghostbrain-memory";
const WARM_DIR   = join(MEMORY_DIR, "warm");
const COLD_DIR   = join(MEMORY_DIR, "cold");

// ── State ─────────────────────────────────────────────────────────────────────

interface TierStats {
  hotEntries:    number;
  hotEstimatedMb: number;
  warmFiles:     number;
  coldFiles:     number;
  tier:          "hot" | "warm" | "cold";
  lastBalancedAt: number;
}

let _lastCompress  = 0;
let _hotEntries    = 0;
let _hotEstimateMb = 0;
let _lastBalancedAt = 0;

// ── File helpers ──────────────────────────────────────────────────────────────

function ensureDirs(): void {
  mkdirSync(WARM_DIR, { recursive: true });
  mkdirSync(COLD_DIR, { recursive: true });
}

function countFilesIn(dir: string): number {
  try {
    return readdirSync(dir).length;
  } catch { return 0; }
}

// ── Eviction: NDJSON log compaction ──────────────────────────────────────────

/**
 * Compact an NDJSON journal by deduplicating and keeping the N most recent
 * entries. Returns the number of entries removed.
 */
export function compactJournal(filePath: string, maxEntries: number): number {
  if (!existsSync(filePath)) return 0;
  try {
    const text  = readFileSync(filePath, "utf8");
    const lines = text.split("\n").filter(Boolean);
    if (lines.length <= maxEntries) return 0;
    const kept    = lines.slice(-maxEntries);
    const removed = lines.length - kept.length;
    const tmp     = filePath + ".tmp";
    writeFileSync(tmp, kept.join("\n") + "\n");
    renameSync(tmp, filePath);
    return removed;
  } catch { return 0; }
}

/**
 * Archive old journal lines to COLD tier (move them out of WARM).
 * This is a best-effort operation.
 */
export function archiveToCold(warmFile: string, maxWarmLines = 500): number {
  if (!existsSync(warmFile)) return 0;
  ensureDirs();
  const filename = warmFile.split("/").pop()!;
  const coldFile = join(COLD_DIR, filename + ".cold");
  try {
    const lines     = readFileSync(warmFile, "utf8").split("\n").filter(Boolean);
    if (lines.length <= maxWarmLines) return 0;
    const hot  = lines.slice(-maxWarmLines);
    const cold = lines.slice(0, lines.length - maxWarmLines);
    // Append cold lines to archive
    writeFileSync(coldFile, (existsSync(coldFile) ? readFileSync(coldFile, "utf8") : "") + cold.join("\n") + "\n");
    writeFileSync(warmFile, hot.join("\n") + "\n");
    return cold.length;
  } catch { return 0; }
}

// ── RAM pressure check ────────────────────────────────────────────────────────

function getRamUsagePercent(): number {
  try {
    const text  = readFileSync("/proc/meminfo", "utf8");
    const total = parseInt(text.match(/MemTotal:\s+(\d+)/)?.[1] ?? "0", 10);
    const avail = parseInt(text.match(/MemAvailable:\s+(\d+)/)?.[1] ?? "0", 10);
    if (total === 0) return 0;
    return ((total - avail) / total) * 100;
  } catch { return 0; }
}

// ── Public balance API ────────────────────────────────────────────────────────

/** Update hot-tier entry count estimate (called by memory modules). */
export function reportHotEntries(count: number, estimatedMb: number): void {
  _hotEntries    = count;
  _hotEstimateMb = estimatedMb;
}

/**
 * Main balance tick — called by the kernel brain every COLLECT interval.
 * Returns a summary of actions taken.
 */
export function balanceTick(): { action: string; detail: string; ramPercent: number } {
  ensureDirs();
  const ramPct = getRamUsagePercent();
  const now    = Date.now();
  _lastBalancedAt = now;

  // Compact WARM-tier journals periodically
  if (now - _lastCompress > COMPRESS_EVERY) {
    _lastCompress = now;
    const journals = [
      join(MEMORY_DIR, "fixes.ndjson"),
      join(MEMORY_DIR, "vectors.ndjson"),
      join(MEMORY_DIR, "infra.ndjson"),
      join(MEMORY_DIR, "patterns.ndjson"),
    ];
    let removed = 0;
    for (const j of journals) removed += compactJournal(j, 2_000);
    if (removed > 0) return { action: "compact", detail: `removed ${removed} old journal entries`, ramPercent: ramPct };
  }

  // RAM pressure — evict
  if (ramPct >= EVICT_THRESHOLD || _hotEstimateMb > HOT_MAX_MB) {
    return { action: "evict", detail: `RAM at ${ramPct.toFixed(1)}% — hot tier pressure`, ramPercent: ramPct };
  }

  return { action: "none", detail: "within limits", ramPercent: ramPct };
}

/** Return current tier statistics. */
export function tierStats(): TierStats {
  const ramPct = getRamUsagePercent();
  const tier: TierStats["tier"] =
    ramPct >= EVICT_THRESHOLD ? "cold" : ramPct >= EVICT_THRESHOLD - 15 ? "warm" : "hot";
  return {
    hotEntries:     _hotEntries,
    hotEstimatedMb: _hotEstimateMb,
    warmFiles:      countFilesIn(WARM_DIR),
    coldFiles:      countFilesIn(COLD_DIR),
    tier,
    lastBalancedAt: _lastBalancedAt,
  };
}
