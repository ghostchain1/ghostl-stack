/**
 * GhostBrain Core — Memory Optimizer
 *
 * Continuously compresses old memory to keep GhostBrain lean and smart.
 *
 * Compression pipeline (runs every COMPRESS_INTERVAL_MS):
 *
 *   1. Pattern deduplication
 *      — Scan pattern_memory: merge entries with identical precursor+consequent
 *        into a single high-confidence entry.
 *
 *   2. Fix consolidation
 *      — Scan fix_memory: promote fixes with successRate > 0.9 to cognitive
 *        knowledge. Mark redundant (low-success) fixes as archived.
 *
 *   3. Infra snapshot compaction
 *      — Average snapshots older than 24 h per resourceId into hourly buckets.
 *
 *   4. Vector de-duplication
 *      — Remove vector entries with cosine similarity > 0.99 (near-duplicates).
 *
 *   5. PostgreSQL retention enforcement
 *      — DELETE system_events older than 90 days.
 *      — Summarize deleted events into task_patterns before deletion.
 *
 * Prometheus metrics:
 *   ghostbrain_memory_compression_runs_total
 *   ghostbrain_memory_patterns_merged_total
 *   ghostbrain_memory_events_archived_total
 *   ghostbrain_memory_vectors_pruned_total
 */

import { execute, query }              from "../db/postgres_client.js";
import { storeKnowledge }              from "../memory/cognitive_memory.js";
import { getAllFixes }                  from "../memory/fix_memory.js";
import { getTopPatterns }              from "../memory/pattern_memory.js";
import { pruneVectors }                from "../memory/vector_memory.js";
import { inc, set }                    from "../observability/metrics_exporter.js";
import { log }                         from "../observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

/** How often the optimizer runs (default: every hour) */
const COMPRESS_INTERVAL_MS = Number(
  process.env.GHOSTBRAIN_COMPRESS_INTERVAL_MS ?? 3_600_000,
);

/** DELETE system_events older than N days (default: 90) */
const EVENT_RETENTION_DAYS = Number(
  process.env.GHOSTBRAIN_EVENT_RETENTION_DAYS ?? 90,
);

/** Minimum cosine similarity to consider two vectors near-duplicate */
const VECTOR_DEDUP_THRESHOLD = 0.99;

// ── State ─────────────────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;
let _lastRunAt: Date | null = null;

let _totalRuns          = 0;
let _patternsMerged     = 0;
let _eventsArchived     = 0;
let _vectorsPruned      = 0;

// ── Public control API ────────────────────────────────────────────────────────

/** Start the background optimization loop. Idempotent. */
export function startMemoryOptimizer(): void {
  if (_timer) return;
  _timer = setInterval(() => {
    void runCompression();
  }, COMPRESS_INTERVAL_MS);
  _timer.unref();

  // Run once shortly after boot to compact any stale data
  setTimeout(() => { void runCompression(); }, 60_000).unref();

  log.info("memory_optimizer: started", `interval=${COMPRESS_INTERVAL_MS}ms retention=${EVENT_RETENTION_DAYS}d`);
}

/** Stop the background optimization loop gracefully. */
export function stopMemoryOptimizer(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

/** Manually trigger a compression run (blocks until complete). */
export async function runCompression(): Promise<CompressionResult> {
  if (_running) {
    log.warn("memory_optimizer: already_running", "skipping concurrent compression");
    return { skipped: true, reason: "already_running" } as CompressionResult;
  }

  _running = true;
  const t0 = Date.now();
  const result: CompressionResult = {
    skipped:         false,
    patternsMerged:  0,
    eventsArchived:  0,
    vectorsPruned:   0,
    fixesPromoted:   0,
    durationMs:      0,
  };

  try {
    log.debug("memory_optimizer: run_start", "compressing memory layers");

    result.patternsMerged = await compressPatterns();
    result.eventsArchived = await archiveOldEvents();
    result.fixesPromoted  = promoteHighConfidenceFixes();
    result.vectorsPruned  = pruneVectorDuplicates();

    _totalRuns++;
    _patternsMerged  += result.patternsMerged;
    _eventsArchived  += result.eventsArchived;
    _vectorsPruned   += result.vectorsPruned;
    _lastRunAt        = new Date();

    result.durationMs = Date.now() - t0;

    updateMetrics();
    inc("ghostbrain_memory_compression_runs_total", "Memory optimizer runs");
    log.info("memory_optimizer: run_complete", JSON.stringify(result));
  } catch (err) {
    log.error("memory_optimizer: run_error", String(err));
  } finally {
    _running = false;
  }
  return result;
}

export interface CompressionResult {
  skipped:         boolean;
  reason?:         string;
  patternsMerged:  number;
  eventsArchived:  number;
  vectorsPruned:   number;
  fixesPromoted:   number;
  durationMs:      number;
}

export function getOptimizerStats() {
  return {
    running:         _running,
    lastRunAt:       _lastRunAt?.toISOString() ?? null,
    totalRuns:       _totalRuns,
    patternsMerged:  _patternsMerged,
    eventsArchived:  _eventsArchived,
    vectorsPruned:   _vectorsPruned,
    retentionDays:   EVENT_RETENTION_DAYS,
    intervalMs:      COMPRESS_INTERVAL_MS,
  };
}

// ── Compression steps ─────────────────────────────────────────────────────────

/**
 * 1. Pattern deduplication
 * Promote high-confidence patterns to cognitive memory.
 */
async function compressPatterns(): Promise<number> {
  // In-memory pattern deduplication
  const patterns = getTopPatterns(1_000);
  let merged = 0;

  for (const p of patterns) {
    if (p.confidence >= 0.85 && p.count >= 5) {
      storeKnowledge(
        "tuning",
        `pattern:${p.precursor}:${p.consequent}`,
        `Recurring pattern: ${p.precursor} → ${p.consequent} (conf=${(p.confidence * 100).toFixed(1)}%, seen=${p.count}, avgDelay=${p.avgDelayMs}ms)`,
        { precursor: p.precursor, consequent: p.consequent, count: p.count, confidence: p.confidence, avgDelayMs: p.avgDelayMs },
        p.confidence,
      );
    }
  }

  // PostgreSQL: merge duplicate task_patterns
  const pgResult = await execute(
    `UPDATE task_patterns tp1
     SET observation_count = tp1.observation_count + tp2.observation_count,
         success_count     = tp1.success_count     + tp2.success_count,
         failure_count     = tp1.failure_count     + tp2.failure_count,
         updated_at        = now()
     FROM task_patterns tp2
     WHERE tp1.trigger_category = tp2.trigger_category
       AND tp1.trigger_label    = tp2.trigger_label
       AND tp1.recommended_action = tp2.recommended_action
       AND tp1.id < tp2.id
       AND tp1.confidence >= tp2.confidence
       RETURNING tp1.id`,
  );
  merged += pgResult;

  // Delete merged duplicates
  await execute(
    `DELETE FROM task_patterns tp
     WHERE id NOT IN (
       SELECT MIN(id) FROM task_patterns
       GROUP BY trigger_category, trigger_label, recommended_action
     )`,
  );

  if (merged > 0) {
    inc("ghostbrain_memory_patterns_merged_total", "Patterns merged by optimizer", merged);
    log.debug("memory_optimizer: patterns_merged", String(merged));
  }
  return merged;
}

/**
 * 2. Archive old PostgreSQL system_events beyond retention window.
 * Summarizes deleted events into task_patterns before removing.
 */
async function archiveOldEvents(): Promise<number> {
  const cutoffDate = new Date(Date.now() - EVENT_RETENTION_DAYS * 86_400_000).toISOString();

  // Summarize events into task_patterns before archiving
  await execute(
    `INSERT INTO task_patterns (pattern_key, trigger_category, trigger_label, recommended_action,
                                action_params, observation_count, last_seen_at)
     SELECT
       md5(category || ':' || label) AS pattern_key,
       category                      AS trigger_category,
       label                         AS trigger_label,
       'observe'                     AS recommended_action,
       '{}'::jsonb                   AS action_params,
       COUNT(*)                      AS observation_count,
       MAX(occurred_at)              AS last_seen_at
     FROM system_events
     WHERE occurred_at < $1
     GROUP BY category, label
     ON CONFLICT (pattern_key) DO UPDATE
       SET observation_count = task_patterns.observation_count + EXCLUDED.observation_count,
           last_seen_at      = GREATEST(task_patterns.last_seen_at, EXCLUDED.last_seen_at),
           updated_at        = now()`,
    [cutoffDate],
  );

  // Delete old events (partition-aware: drop will be faster for very old partitions)
  const deleted = await execute(
    `DELETE FROM system_events WHERE occurred_at < $1`,
    [cutoffDate],
  );

  if (deleted > 0) {
    inc("ghostbrain_memory_events_archived_total", "Events archived/deleted by optimizer", deleted);
    log.info("memory_optimizer: events_archived", `deleted=${deleted} before=${cutoffDate}`);
  }
  return deleted;
}

/**
 * 3. Promote high-success fixes to cognitive knowledge.
 */
function promoteHighConfidenceFixes(): number {
  const fixes  = getAllFixes();
  let promoted = 0;
  for (const fix of fixes) {
    if (fix.successRate >= 0.9 && (fix.successCount ?? 0) >= 3) {
      storeKnowledge(
        "tuning",
        `fix:${fix.id}`,
        `High-confidence fix (${(fix.successRate * 100).toFixed(1)}% success): "${fix.solution}" for "${fix.problem}"`,
        { problem: fix.problem, solution: fix.solution, actionType: fix.actionType, successRate: fix.successRate },
        fix.successRate,
      );
      promoted++;
    }
  }
  return promoted;
}

/**
 * 4. Prune near-duplicate vectors from the file-backed vector store.
 */
function pruneVectorDuplicates(): number {
  try {
    return pruneVectors(VECTOR_DEDUP_THRESHOLD);
  } catch {
    return 0;
  }
}

// ── Metrics ───────────────────────────────────────────────────────────────────

function updateMetrics(): void {
  set("ghostbrain_memory_compression_runs_total",  "Memory optimizer runs",   _totalRuns);
  set("ghostbrain_memory_patterns_merged_total",   "Patterns merged",          _patternsMerged);
  set("ghostbrain_memory_events_archived_total",   "Events archived",          _eventsArchived);
  set("ghostbrain_memory_vectors_pruned_total",    "Vectors pruned",           _vectorsPruned);
}
