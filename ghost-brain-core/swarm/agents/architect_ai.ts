/**
 * GhostBrain Swarm — Architect AI
 *
 * Analyses persistent memory patterns using PatternDetector + FailurePredictor
 * and produces architectural recommendations. Does not take any direct
 * infrastructure action — all recommendations are advisory and must flow
 * through ConsensusEngine before the supervisor acts on them.
 *
 * Responsibilities:
 *   - Detect recurring failure categories using the memory frequency maps.
 *   - Identify time-of-day patterns (e.g. validator crashes at 03:00 UTC).
 *   - Compute failure predictions from detected patterns.
 *   - Publish arch:concern messages on the bus for high-confidence predictions.
 *   - Recommend governance proposals for systemic failures.
 */

import { PatternDetector } from "../../memory/learning/pattern_detector.js";
import { FailurePredictor } from "../../memory/learning/failure_predictor.js";
import type { ISwarmAgent, SwarmContext, AgentReport, AgentRecommendation } from "../coordination/agent_interface.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Confidence threshold above which a concern is published on the bus. */
const CONCERN_THRESHOLD = parseFloat(process.env["ARCH_CONCERN_THRESHOLD"] ?? "0.5");

/** Categories considered "systemic" — trigger governance proposals. */
const SYSTEMIC_CATEGORIES = new Set([
  "vm_crash", "vm_offline", "docker_failure", "docker_oom", "l2_lag",
]);

// ---------------------------------------------------------------------------
// ArchitectAI
// ---------------------------------------------------------------------------

export class ArchitectAI implements ISwarmAgent {
  readonly name = "architect_ai";
  readonly role = "architect" as const;

  async act(ctx: SwarmContext): Promise<AgentReport> {
    const t0 = Date.now();
    const recommendations: AgentRecommendation[] = [];

    try {
      // Run pattern detection and failure prediction on current memory.
      const detector  = new PatternDetector(ctx.memory.reader);
      const predictor = new FailurePredictor();

      const patterns    = detector.detect();
      const predictions = predictor.predict(patterns);

      for (const pred of predictions) {
        if (pred.confidence < 0.3) continue;  // Skip very low-confidence noise.

        // Publish to bus if notable.
        if (pred.confidence >= CONCERN_THRESHOLD) {
          const pattern = patterns.find(p => p.category === pred.category);
          if (pattern) {
            ctx.bus.publish("arch:concern", this.name, {
              category:   pred.category,
              pattern,
              prediction: pred,
              suggestion: this.buildSuggestion(pred.category, pred.severity),
            });
          }
        }

        // Build recommendation for ConsensusEngine.
        const isSystemic = SYSTEMIC_CATEGORIES.has(pred.category);
        const kind = isSystemic ? "governance_propose" : "monitor_increase";

        recommendations.push({
          kind,
          target:      pred.category,
          confidence:  pred.confidence,
          priority:    pred.severity === "critical" ? 90 : pred.severity === "warn" ? 60 : 30,
          description:
            `Architect: ${pred.message}` +
            (pred.peakHour !== undefined ? ` (peak UTC hour ${pred.peakHour})` : ""),
        });
      }

      // Identify the top-3 failing sources (hotspot analysis).
      const sourceFreq = ctx.memory.reader.sourceFrequencyMap(60 * 60_000); // last hour
      for (const { source, count } of sourceFreq.slice(0, 3)) {
        if (count >= 10) {
          recommendations.push({
            kind:        "inspect_source",
            target:      source,
            confidence:  Math.min(count / 50, 0.9),
            priority:    50,
            description: `Architect: source "${source}" generated ${count} events in the last hour`,
          });
        }
      }

      return {
        agentName:       this.name,
        role:            this.role,
        healthy:         true,
        durationMs:      Date.now() - t0,
        recommendations,
        summary:
          `Patterns: ${patterns.length}, Predictions: ${predictions.length}, ` +
          `Concerns published: ${predictions.filter(p => p.confidence >= CONCERN_THRESHOLD).length}`,
      };
    } catch (err) {
      return {
        agentName:       this.name,
        role:            this.role,
        healthy:         false,
        durationMs:      Date.now() - t0,
        recommendations: [],
        summary:         err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildSuggestion(
    category: string,
    severity: "watch" | "warn" | "critical",
  ): string {
    const base: Record<string, string> = {
      vm_crash:          "Consider increasing VM memory allocation or reviewing OOM limits",
      vm_offline:        "Check hypervisor health and ensure VM auto-start is enabled",
      docker_failure:    "Review container restart policies and resource limits",
      docker_oom:        "Increase container memory limits or reduce co-located workloads",
      l2_lag:            "Investigate L2 batcher throughput and L1 gas pricing",
      network_degraded:  "Check NIC firmware and interface driver versions",
      hypervisor_load:   "Consider horizontal scaling or workload migration",
    };
    const suggestion = base[category] ?? `Review ${category} event root cause`;
    return severity === "critical" ? `[CRITICAL] ${suggestion}` : suggestion;
  }
}
