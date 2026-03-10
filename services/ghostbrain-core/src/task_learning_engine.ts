/**
 * GhostBrain Core — Task Learning Engine
 *
 * Implements the full observe → record → optimize → execute lifecycle.
 *
 * Capabilities:
 *   observe_task()           — watch a task execution and record its context
 *   record_task_pattern()    — persist the task→outcome mapping
 *   optimize_future_task()   — re-score pattern confidence after feedback
 *   autonomously_execute()   — propose (never directly execute) the best known action
 *
 * Example:
 *   Docker container crashes repeatedly →
 *   GhostBrain learns the crash→repair sequence →
 *   Next occurrence: returns preferred repair action with high confidence.
 *
 * SAFETY: autonomously_execute() NEVER performs on-chain or irreversible actions.
 * It returns a TaskProposal that must be ratified by auto_repair_engine (which
 * has its own PolicyGuard gate — see AGENTS.md §7).
 */

import { store_event, store_pattern, predict_next_action } from "./memory_engine.js";
import { analyzePatterns }   from "./pattern_analyzer.js";
import { log }               from "./observability/event_logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskObservation {
  taskId:       string;
  resourceId:   string;
  layer:        string;
  triggerEvent: string;         // e.g. "container:oom_kill"
  actionTaken:  string;         // e.g. "restart_container"
  params:       Record<string, unknown>;
  startedAt:    number;
  finishedAt:   number;
  success:      boolean;
  errorDetail?: string;
}

export interface TaskPattern {
  key:          string;         // hash of triggerEvent + actionTaken
  triggerEvent: string;
  action:       string;
  params:       Record<string, unknown>;
  successCount: number;
  failureCount: number;
  confidence:   number;         // successCount / (successCount + failureCount)
  avgDurationMs: number;
  lastUsedAt:   number;
}

export interface TaskProposal {
  taskId:       string;
  resourceId:   string;
  action:       string;
  params:       Record<string, unknown>;
  confidence:   number;
  rationale:    string;
  dryRun:       boolean;        // always true until PolicyGuard approves
}

// ── State ─────────────────────────────────────────────────────────────────────

const _patterns = new Map<string, TaskPattern>();
let _totalObservations = 0;

function patternKey(triggerEvent: string, action: string): string {
  return `${triggerEvent}::${action}`;
}

// ── Core functions ─────────────────────────────────────────────────────────────

/**
 * Observe a completed task. Updates pattern memory and fires a memory store.
 */
export function observe_task(obs: TaskObservation): void {
  _totalObservations++;
  const durationMs = obs.finishedAt - obs.startedAt;

  // Feed into memory engine
  store_event({
    resourceId: obs.resourceId,
    layer:      obs.layer,
    category:   "task",
    label:      obs.success ? "task_success" : "task_failure",
    severity:   obs.success ? "info" : "warning",
    payload:    {
      taskId:   obs.taskId,
      trigger:  obs.triggerEvent,
      action:   obs.actionTaken,
      durationMs,
      success:  obs.success,
    },
  });

  // Record pattern
  record_task_pattern({
    triggerEvent: obs.triggerEvent,
    action:       obs.actionTaken,
    params:       obs.params,
    success:      obs.success,
    durationMs,
  });

  log.debug("task_learning: recorded", `taskId=${obs.taskId} success=${obs.success} durationMs=${durationMs}`);
}

/**
 * Persist a task→outcome mapping into the in-memory pattern store.
 * Also forwards to memory_engine for vector embedding.
 */
export function record_task_pattern(opts: {
  triggerEvent: string;
  action:       string;
  params:       Record<string, unknown>;
  success:      boolean;
  durationMs:   number;
}): void {
  const key  = patternKey(opts.triggerEvent, opts.action);
  const existing = _patterns.get(key) ?? {
    key,
    triggerEvent: opts.triggerEvent,
    action:       opts.action,
    params:       opts.params,
    successCount: 0,
    failureCount: 0,
    confidence:   0,
    avgDurationMs: 0,
    lastUsedAt:   0,
  };

  if (opts.success) existing.successCount++;
  else              existing.failureCount++;

  const total = existing.successCount + existing.failureCount;
  existing.confidence    = existing.successCount / total;
  existing.avgDurationMs = (existing.avgDurationMs * (total - 1) + opts.durationMs) / total;
  existing.lastUsedAt    = Date.now();
  existing.params        = opts.params;

  _patterns.set(key, existing);

  // Forward to shared memory
  store_pattern({
    triggerCategory: opts.triggerEvent.split(":")[0] ?? "unknown",
    triggerLabel:    opts.triggerEvent.split(":")[1] ?? opts.triggerEvent,
    action:          opts.action,
    params:          opts.params,
    successRate:     existing.confidence,
  });
}

/**
 * Re-score / adjust pattern confidence after external feedback.
 * Rating: +1 = good, 0 = neutral, -1 = bad.
 */
export function optimize_future_task(triggerEvent: string, action: string, rating: -1 | 0 | 1): void {
  const key = patternKey(triggerEvent, action);
  const p   = _patterns.get(key);
  if (!p) return;

  // Bayesian nudge: treat feedback as an additional virtual observation
  if (rating === 1)  p.successCount += 2;
  if (rating === -1) p.failureCount += 2;

  const total = p.successCount + p.failureCount;
  p.confidence = p.successCount / total;
  _patterns.set(key, p);

  log.info("task_learning: pattern_optimized", `triggerEvent=${triggerEvent} action=${action} newConf=${p.confidence.toFixed(3)}`);
}

/**
 * Propose the best known autonomous action for a given resource + trigger.
 * Returns a TaskProposal (always dryRun=true — PolicyGuard gates execution).
 */
export function autonomously_execute(resourceId: string, triggerEvent: string): TaskProposal | null {
  // Consult memory engine first
  const prediction = predict_next_action(resourceId, triggerEvent.split(":")[1] ?? triggerEvent);

  // Also check local pattern store
  let bestPattern: TaskPattern | null = null;
  for (const p of _patterns.values()) {
    if (p.triggerEvent === triggerEvent && p.confidence >= 0.5) {
      if (!bestPattern || p.confidence > bestPattern.confidence) bestPattern = p;
    }
  }

  // Pick best signal
  const source   = bestPattern && (!prediction || bestPattern.confidence >= prediction.confidence)
    ? bestPattern : prediction;

  if (!source) return null;

  const isBestPattern = "triggerEvent" in source;
  const action     = isBestPattern ? (source as TaskPattern).action : (source as typeof prediction)!.action;
  const confidence = isBestPattern ? (source as TaskPattern).confidence : (source as typeof prediction)!.confidence;
  const rationale  = isBestPattern
    ? `Learned pattern (seen ${(source as TaskPattern).successCount + (source as TaskPattern).failureCount}× — ${(confidence * 100).toFixed(1)}% success)`
    : (source as typeof prediction)!.rationale;

  return {
    taskId:     `tl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    resourceId,
    action,
    params:     isBestPattern ? (source as TaskPattern).params : (source as typeof prediction)?.params ?? {},
    confidence,
    rationale,
    dryRun:     true,  // caller (auto_repair_engine) decides whether to execute
  };
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getTopLearnedPatterns(limit = 10): TaskPattern[] {
  return [..._patterns.values()]
    .sort((a, b) => b.confidence - a.confidence || b.successCount - a.successCount)
    .slice(0, limit);
}

export function getTaskLearningStats() {
  return {
    totalObservations: _totalObservations,
    totalPatterns:     _patterns.size,
    topPatterns:       getTopLearnedPatterns(5),
  };
}
