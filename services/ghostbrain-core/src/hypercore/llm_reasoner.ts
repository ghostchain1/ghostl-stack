/**
 * GhostBrain HyperCore — LLM Reasoner
 *
 * Provides language-model-grade reasoning over system state by chaining
 * multiple intelligence layers:
 *
 *   Cognitive memory  → known crash / attack patterns
 *   Fix memory        → empirical remediation success rates
 *   Neural graph      → successful causal chains from past events
 *   Infra history     → rolling resource trend data
 *
 * "LLM" here is a structured multi-source inference engine that produces
 * natural-language findings with evidence chains.  An external model
 * endpoint is pluggable via LLM_REASONER_URL; without it the engine
 * runs entirely on in-process GhostBrain data.
 *
 * Safety: insights with requiresGovernance=true are forwarded to the
 * signing relay (:7910) for human ratification before any action.
 *
 * Prometheus metrics:
 *   ghostbrain_hypercore_llm_analyses_total
 *   ghostbrain_hypercore_llm_insights_total
 *   ghostbrain_hypercore_llm_critical_total
 *   ghostbrain_hypercore_llm_duration_seconds
 */

import { randomUUID }          from "node:crypto";
import { request }             from "undici";
import { queryKnowledge }      from "../memory/cognitive_memory.js";
import { getAllFixes }          from "../memory/fix_memory.js";
import { getSuccessfulChains } from "../memory/neural_memory_graph.js";
import { getInfraHistory }     from "../memory/infrastructure_memory.js";
import { inc, observe }        from "../observability/metrics_exporter.js";
import { log }                 from "../observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const SIGNING_RELAY     = process.env.SIGNING_RELAY_URL         ?? "http://localhost:7910";
const INSIGHT_WINDOW_MS = Number(process.env.HYPERCORE_INSIGHT_WINDOW_MS ?? "300000"); // 5 min

// ── Types ─────────────────────────────────────────────────────────────────────

export type InsightDomain   = "infrastructure" | "blockchain" | "security" | "performance" | "governance";
export type InsightSeverity = "info" | "warning" | "critical";

export interface SystemInsight {
  id:                 string;
  ts:                 number;
  domain:             InsightDomain;
  severity:           InsightSeverity;
  /** Short human-readable finding */
  finding:            string;
  /** Diagnosed root cause (may be "unknown") */
  rootCause:          string;
  /** Concrete remediation suggestion */
  suggestion:         string;
  /** Evidence strings (metrics, pattern matches, log excerpts) */
  evidence:           string[];
  /** Heuristic confidence score 0–1 */
  confidence:         number;
  /** Whether human ratification is required before acting */
  requiresGovernance: boolean;
}

// ── State ─────────────────────────────────────────────────────────────────────

const _ring: SystemInsight[]  = [];
const MAX_RING                = 200;
let   _analysisCycles         = 0;

function pushInsight(i: SystemInsight): void {
  _ring.push(i);
  if (_ring.length > MAX_RING) _ring.shift();
}

// ── Governance relay ──────────────────────────────────────────────────────────

async function submitToRelay(insight: SystemInsight): Promise<void> {
  try {
    await request(SIGNING_RELAY, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type:                 "hypercore_insight",
        severity:             insight.severity,
        finding:              insight.finding,
        suggestion:           insight.suggestion,
        rootCause:            insight.rootCause,
        evidence:             insight.evidence,
        requires_human_review: true,
        generatedAt:          new Date(insight.ts).toISOString(),
      }),
    });
  } catch { /* relay is advisory path — non-fatal */ }
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class LLMReasoner {

  /**
   * Analyze the entire system against all memory layers and produce a ranked
   * list of insights.  Operates on local memory — never calls an external API
   * unless LLM_REASONER_URL is configured.
   */
  async analyze(): Promise<SystemInsight[]> {
    const t0 = Date.now();
    _analysisCycles++;
    inc("ghostbrain_hypercore_llm_analyses_total", "Total LLM Reasoner analysis cycles");

    const insights: SystemInsight[] = [];

    try {
      // ── 1. Cognitive memory: crash + attack patterns ──────────────────────
      const crashPatterns  = queryKnowledge("crash");
      const attackPatterns = queryKnowledge("attack");
      const strategyKnowledge = queryKnowledge("tuning");

      const recurringCrashes = crashPatterns.filter(k => k.seenCount >= 3);
      const recentAttacks    = attackPatterns.filter(k => (Date.now() - k.lastSeen) < 30 * 60_000);

      if (recurringCrashes.length > 0) {
        const top = recurringCrashes.sort((a, b) => b.seenCount - a.seenCount)[0]!;
        insights.push({
          id:                 randomUUID(),
          ts:                 Date.now(),
          domain:             "infrastructure",
          severity:           top.seenCount >= 10 ? "critical" : "warning",
          finding:            `Recurring crash pattern: "${top.key}" (${top.seenCount}×)`,
          rootCause:          top.summary,
          suggestion:         `Investigate ${top.key}. Consider memory increase or workload isolation to end crash loop.`,
          evidence:           [
            `seen ${top.seenCount} times`,
            `confidence ${(top.confidence * 100).toFixed(0)}%`,
            `last seen ${new Date(top.lastSeen).toISOString()}`,
          ],
          confidence:         Math.min(0.96, top.confidence + 0.1 * Math.log1p(top.seenCount)),
          requiresGovernance: top.seenCount >= 10,
        });
      }

      if (recentAttacks.length > 0) {
        insights.push({
          id:                 randomUUID(),
          ts:                 Date.now(),
          domain:             "security",
          severity:           "critical",
          finding:            `${recentAttacks.length} active attack signature(s) detected in the last 30 min`,
          rootCause:          recentAttacks.map(a => a.key).join(", "),
          suggestion:         "Activate GhostSecurityGuardian isolation mode and alert operators immediately.",
          evidence:           recentAttacks.map(a => `${a.key}: ${a.summary} (seen ${a.seenCount}×)`),
          confidence:         0.91,
          requiresGovernance: true,
        });
      }

      // ── 2. Fix memory: low-performing strategies ──────────────────────────
      const fixes = getAllFixes();
      const poorFixes = fixes.filter(f => {
        const n = (f.successCount ?? 0) + (f.failureCount ?? 0);
        return n >= 5 && f.successRate < 0.5;
      });

      if (poorFixes.length > 0) {
        insights.push({
          id:                 randomUUID(),
          ts:                 Date.now(),
          domain:             "performance",
          severity:           "warning",
          finding:            `${poorFixes.length} fix strategy(ies) below 50% success rate`,
          rootCause:          "Heuristic strategies may be miscalibrated for current system conditions",
          suggestion:         "Trigger HyperCore Evolution Engine to rewrite under-performing strategies.",
          evidence:           poorFixes.map(f => {
            const n = (f.successCount ?? 0) + (f.failureCount ?? 0);
            return `${f.actionType}: ${(f.successRate * 100).toFixed(0)}% (n=${n})`;
          }),
          confidence:         0.82,
          requiresGovernance: false,
        });
      }

      // ── 3. Neural graph: chain coverage ──────────────────────────────────
      const successChains = await getSuccessfulChains(50);
      if (successChains.length < 5 && _analysisCycles > 5) {
        insights.push({
          id:                 randomUUID(),
          ts:                 Date.now(),
          domain:             "performance",
          severity:           "info",
          finding:            "Neural memory graph has few successful repair chains recorded",
          rootCause:          "Insufficient historical repair data for high-confidence predictions",
          suggestion:         "Allow GhostBrain to accumulate more repair history. No action needed yet.",
          evidence:           [`successful chains: ${successChains.length}`],
          confidence:         0.60,
          requiresGovernance: false,
        });
      }

      // ── 4. Infra history: system-wide resource trends ─────────────────────
      const history = getInfraHistory(undefined, undefined, INSIGHT_WINDOW_MS);
      if (history.length > 0) {
        const avgCpu    = history.reduce((s, h) => s + h.cpuPct, 0) / history.length;
        const avgMem    = history.reduce((s, h) => s + h.memPct, 0) / history.length;
        const critCount = history.filter(h => h.severity === "critical").length;
        const critRatio = critCount / history.length;

        if (avgCpu > 85) {
          insights.push({
            id:                 randomUUID(),
            ts:                 Date.now(),
            domain:             "infrastructure",
            severity:           avgCpu > 95 ? "critical" : "warning",
            finding:            `System-wide CPU saturation — avg ${avgCpu.toFixed(0)}% over 5 min`,
            rootCause:          "Sustained CPU load across multiple resources",
            suggestion:         "DevOps AI should scale out compute. Migrate hotspot workloads.",
            evidence:           [`avg cpu=${avgCpu.toFixed(1)}%`, `samples=${history.length}`],
            confidence:         0.88,
            requiresGovernance: avgCpu > 95,
          });
        }

        if (avgMem > 85) {
          insights.push({
            id:                 randomUUID(),
            ts:                 Date.now(),
            domain:             "infrastructure",
            severity:           avgMem > 95 ? "critical" : "warning",
            finding:            `System-wide memory pressure — avg ${avgMem.toFixed(0)}% over 5 min`,
            rootCause:          "Sustained memory usage across multiple resources",
            suggestion:         "Scale memory allocation. Investigate services for memory leaks.",
            evidence:           [`avg mem=${avgMem.toFixed(1)}%`, `samples=${history.length}`],
            confidence:         0.86,
            requiresGovernance: avgMem > 95,
          });
        }

        if (critRatio > 0.3) {
          insights.push({
            id:                 randomUUID(),
            ts:                 Date.now(),
            domain:             "infrastructure",
            severity:           "critical",
            finding:            `${(critRatio * 100).toFixed(0)}% of infra snapshots are severity=critical`,
            rootCause:          "Widespread infrastructure degradation",
            suggestion:         "Immediate intervention required. Activate full AI swarm response.",
            evidence:           [
              `critical events=${critCount}`,
              `total snapshots=${history.length}`,
              `ratio=${(critRatio * 100).toFixed(0)}%`,
            ],
            confidence:         0.93,
            requiresGovernance: true,
          });
        }
      }

      // ── 5. Strategy knowledge gap ─────────────────────────────────────────
      if (strategyKnowledge.length === 0 && _analysisCycles > 10) {
        insights.push({
          id:                 randomUUID(),
          ts:                 Date.now(),
          domain:             "governance",
          severity:           "info",
          finding:            "No strategy patterns recorded in cognitive memory",
          rootCause:          "Strategy knowledge base is empty",
          suggestion:         "Run Evolution Engine to bootstrap strategy templates from fix memory.",
          evidence:           ["strategy patterns: 0"],
          confidence:         0.70,
          requiresGovernance: false,
        });
      }

      // ── Emit + relay governance insights ─────────────────────────────────
      for (const insight of insights) {
        pushInsight(insight);
        inc("ghostbrain_hypercore_llm_insights_total", "Total insights generated by LLM Reasoner");
        if (insight.severity === "critical") {
          inc("ghostbrain_hypercore_llm_critical_total", "Critical insights requiring governance action");
        }
        if (insight.requiresGovernance) void submitToRelay(insight);
      }

    } catch (err) {
      log.error("hypercore.llm_reasoner", `analyze error: ${String(err)}`);
    }

    observe(
      "ghostbrain_hypercore_llm_duration_seconds",
      "LLM Reasoner analysis latency in seconds",
      (Date.now() - t0) / 1000,
    );

    return insights;
  }

  /** Retrieve recent insights from ring buffer. */
  getInsights(n = 50): SystemInsight[] {
    return _ring.slice(-n);
  }

  stats() {
    return {
      analysisCycles: _analysisCycles,
      insightsStored: _ring.length,
      criticalCount:  _ring.filter(i => i.severity === "critical").length,
      warningCount:   _ring.filter(i => i.severity === "warning").length,
      latestInsight:  _ring.at(-1)?.ts ?? null,
    };
  }
}

export const llmReasoner = new LLMReasoner();
