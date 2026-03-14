/**
 * GhostBrain Cognitive Engine — Reasoning Engine
 *
 * Analyses infrastructure events by consulting all memory layers
 * to classify the problem and formulate a root-cause hypothesis.
 *
 * Classification:
 *   known_issue       — seen ≥ 3 times; fix exists in memory
 *   recurring_pattern — seen ≥ 3 times; no reliable fix yet
 *   emerging_threat   — 1–2 occurrences; escalating severity
 *   novel_issue       — no memory of this type of event
 *
 * Outputs a `Reasoning` record consumed by the PlanningEngine.
 *
 * Prometheus metrics:
 *   ghostbrain_reasoning_calls_total
 *   ghostbrain_reasoning_known_total
 *   ghostbrain_reasoning_novel_total
 */

import { queryKnowledge }         from "../memory/cognitive_memory.js";
import { getInfraHistory }        from "../memory/infrastructure_memory.js";
import { getAllFixes }             from "../memory/fix_memory.js";
import { search }                 from "../memory/vector_memory.js";
import { findChainsByEvent }      from "../memory/neural_memory_graph.js";
import { inc }                    from "../observability/metrics_exporter.js";
import { log }                    from "../observability/event_logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReasoningClass =
  | "known_issue"
  | "recurring_pattern"
  | "emerging_threat"
  | "novel_issue";

export type ReasoningSeverity = "low" | "medium" | "high" | "critical";

export interface CognitiveEvent {
  /** Human-readable event label, e.g. "validator_down", "container_crash" */
  label:       string;
  /** The affected resource ID */
  resourceId:  string;
  /** Infrastructure layer: l1, l2, l3, container, vm, service */
  layer:       string;
  /** Optional extra key-value context */
  payload?:    Record<string, unknown>;
  /** Timestamp (ms since epoch). Defaults to now. */
  ts?:         number;
}

export interface Reasoning {
  event:           CognitiveEvent;
  classification:  ReasoningClass;
  severity:        ReasoningSeverity;
  confidence:      number;           // 0–1
  rootCause:       string;
  affectedLayers:  string[];
  rationale:       string[];
  similarCount:    number;           // how many prior occurrences found
  hasFix:          boolean;          // memory contains a known fix
  fixSuccessRate:  number;           // best known fix success rate (0 if no fix)
  reasonedAt:      number;           // ms epoch
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class ReasoningEngine {

  /**
   * Analyse a cognitive event against all memory layers.
   * Returns a structured Reasoning record. Never throws.
   */
  async analyze(event: CognitiveEvent): Promise<Reasoning> {
    const start = Date.now();
    inc("ghostbrain_reasoning_calls_total", "Total reasoning engine invocations");

    const rationale: string[] = [];
    const affectedLayers = new Set<string>([event.layer]);
    let severity: ReasoningSeverity = "low";
    let confidence = 0.5;
    let rootCause = "unknown";
    let hasFix = false;
    let fixSuccessRate = 0;

    try {
      // ── 1. Cognitive memory: known crash/attack patterns ─────────────────
      const cogPatterns = queryKnowledge("crash").filter(k =>
        k.key.includes(event.label) || k.key.includes(event.resourceId),
      );
      const attackPatterns = queryKnowledge("attack").filter(k =>
        k.key.includes(event.label) || k.key.includes(event.resourceId),
      );

      if (cogPatterns.length > 0) {
        rationale.push(`Cognitive memory: ${cogPatterns.length} crash/fix record(s) for this resource/event`);
        rootCause = cogPatterns[0]?.summary ?? rootCause;
      }
      if (attackPatterns.length > 0) {
        rationale.push(`Attack signatures found: ${attackPatterns.length} records`);
        severity = "high";
        affectedLayers.add("security");
      }

      // ── 2. Infrastructure history (last 30 min) ──────────────────────────
      const history = getInfraHistory(event.resourceId, undefined, 1_800_000);
      const critEvents = history.filter(s => s.severity === "critical").length;
      const avgCpu = history.length
        ? history.reduce((s, h) => s + h.cpuPct, 0) / history.length : 0;
      const avgMem = history.length
        ? history.reduce((s, h) => s + h.memPct, 0) / history.length : 0;
      const maxRestarts = history.reduce((s, h) => Math.max(s, h.restarts), 0);

      if (avgCpu > 90 || avgMem > 90) {
        severity = "critical";
        rootCause = `Resource saturation (cpu=${avgCpu.toFixed(0)}% mem=${avgMem.toFixed(0)}%)`;
        rationale.push(`Critical resource saturation detected`);
      } else if (avgCpu > 75 || avgMem > 75) {
        severity = "high";
        rootCause = rootCause === "unknown"
          ? `High resource utilisation (cpu=${avgCpu.toFixed(0)}% mem=${avgMem.toFixed(0)}%)`
          : rootCause;
        rationale.push(`Elevated resource utilisation detected`);
      }
      if (critEvents > 0) {
        rationale.push(`${critEvents} critical severity events in infra history`);
      }
      if (maxRestarts > 3) {
        rationale.push(`Restart storm detected (max=${maxRestarts})`);
        affectedLayers.add("orchestrator");
      }

      // ── 3. Semantic similarity search in vector memory ───────────────────
      const similar = search(`${event.label} ${event.layer} ${event.resourceId}`, 20);
      const similarCount = similar.length;

      if (similarCount > 0) {
        rationale.push(`Vector memory: ${similarCount} semantically similar event(s) found`);
        confidence = Math.min(0.95, 0.5 + (similarCount / 40));
      }

      // ── 4. Neural memory graph: prior causal chains ──────────────────────
      const chains = await findChainsByEvent(event.label, 10);
      if (chains.length > 0) {
        rationale.push(`Neural graph: ${chains.length} prior causal chain(s) match this event`);
        const successful = chains.filter(c => c.outcome?.payload?.["success"] === true);
        if (successful.length > 0) {
          hasFix = true;
          rationale.push(`${successful.length} of those chains had successful outcomes`);
          confidence = Math.max(confidence, 0.75);
        }
      }

      // ── 5. Fix memory: best known remedy ─────────────────────────────────
      const fixes = getAllFixes();
      const matchingFixes = fixes.filter(f =>
        f.problem.toLowerCase().includes(event.label.toLowerCase()) ||
        f.actionType.toLowerCase().includes(event.layer.toLowerCase()),
      );
      if (matchingFixes.length > 0) {
        hasFix = true;
        fixSuccessRate = Math.max(...matchingFixes.map(f => f.successRate));
        rationale.push(`Fix memory: best fix success rate ${(fixSuccessRate * 100).toFixed(1)}%`);
        if (fixSuccessRate >= 0.8) confidence = Math.max(confidence, 0.82);
      }

      // ── 6. Classify based on accumulated evidence ─────────────────────────
      let classification: ReasoningClass;
      const occurrences = similarCount + chains.length + cogPatterns.length;

      if (hasFix && fixSuccessRate >= 0.7 && occurrences >= 2) {
        classification = "known_issue";
        inc("ghostbrain_reasoning_known_total", "Known issue classifications");
      } else if (occurrences >= 3) {
        classification = "recurring_pattern";
      } else if (occurrences >= 1) {
        classification = "emerging_threat";
        if (severity === "low") severity = "medium";
      } else {
        classification = "novel_issue";
        confidence = Math.max(0.3, confidence * 0.6);
        inc("ghostbrain_reasoning_novel_total", "Novel (unseen) issue detections");
      }

      // Add affected layers from payload context
      const payloadLayer = event.payload?.["layer"] as string | undefined;
      if (payloadLayer) affectedLayers.add(payloadLayer);
      if (event.label.includes("l1") || event.label.includes("chain"))  affectedLayers.add("l1");
      if (event.label.includes("l2") || event.label.includes("rollup")) affectedLayers.add("l2");
      if (event.label.includes("l3"))                                    affectedLayers.add("l3");
      if (event.label.includes("validator"))                             affectedLayers.add("consensus");

      log.debug("reasoning_engine: analyzed",
        `event=${event.label} class=${classification} severity=${severity} conf=${confidence.toFixed(2)} ms=${Date.now() - start}`);

      return {
        event,
        classification,
        severity,
        confidence,
        rootCause,
        affectedLayers: [...affectedLayers],
        rationale,
        similarCount: occurrences,
        hasFix,
        fixSuccessRate,
        reasonedAt: Date.now(),
      };
    } catch (err) {
      log.warn("reasoning_engine: error", String(err));
      return {
        event,
        classification: "novel_issue",
        severity:        "medium",
        confidence:      0.3,
        rootCause:       "analysis_error",
        affectedLayers:  [event.layer],
        rationale:       [`Reasoning error: ${String(err)}`],
        similarCount:    0,
        hasFix:          false,
        fixSuccessRate:  0,
        reasonedAt:      Date.now(),
      };
    }
  }
}

export const reasoningEngine = new ReasoningEngine();
