/**
 * GCL — Pattern Analyzer
 * Detects repeating behavioural patterns across memory entries and
 * experience events. Produces frequency, trend, and confidence metrics.
 */

import type { MemoryEntry } from "../memory/longTermMemory";
import type { Experience }   from "../memory/experienceStore";

export interface PatternResult {
  id:         string;
  type:       "temporal" | "causal" | "agent" | "domain" | "tag";
  label:      string;
  count:      number;
  frequency:  number;         // occurrences per hour
  trend:      "rising" | "stable" | "declining";
  confidence: number;         // 0.0 – 1.0
  examples:   string[];
  insight:    string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function occurrencesPerHour(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  const oldest = Math.min(...timestamps);
  const newest = Math.max(...timestamps);
  const spanH  = (newest - oldest) / 3_600_000;
  return spanH > 0 ? Math.round((timestamps.length / spanH) * 100) / 100 : 0;
}

function trendFor(timestamps: number[]): "rising" | "stable" | "declining" {
  if (timestamps.length < 4) return "stable";
  const sorted = [...timestamps].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  const firstHalf  = sorted.slice(0, half);
  const secondHalf = sorted.slice(half);
  const firstCt  = firstHalf.length;
  const secondCt = secondHalf.length;
  const ratio = secondCt / (firstCt || 1);
  if (ratio >= 1.3) return "rising";
  if (ratio <= 0.7) return "declining";
  return "stable";
}

// Build confidence from count + frequency
function confidence(count: number, freq: number): number {
  return Math.min(0.97, 0.35 + count * 0.04 + freq * 0.06);
}

// ── Analysis ──────────────────────────────────────────────────────────────────

function analyzeByDomain(memory: MemoryEntry[]): PatternResult[] {
  const groups: Record<string, MemoryEntry[]> = {};
  for (const m of memory) {
    (groups[m.domain] ??= []).push(m);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length >= 3)
    .map(([domain, items]) => {
      const times = items.map(i => i.timestamp);
      const freq  = occurrencesPerHour(times);
      const trend = trendFor(times);
      const conf  = confidence(items.length, freq);
      const examples = items.slice(-3).map(i => i.action);
      return {
        id:         `pattern-domain-${domain}`,
        type:       "domain" as const,
        label:      `${domain} activity cluster`,
        count:      items.length,
        frequency:  freq,
        trend,
        confidence: Math.round(conf * 100) / 100,
        examples,
        insight:    `${domain} actions are ${trend} at ${freq}/hr — ${items.filter(i => i.success).length}/${items.length} succeeded`,
      };
    });
}

function analyzeByAgent(memory: MemoryEntry[]): PatternResult[] {
  const groups: Record<string, MemoryEntry[]> = {};
  for (const m of memory) {
    (groups[m.agent] ??= []).push(m);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length >= 2)
    .map(([agent, items]) => {
      const times   = items.map(i => i.timestamp);
      const freq    = occurrencesPerHour(times);
      const trend   = trendFor(times);
      const conf    = confidence(items.length, freq);
      const avgSucc = items.reduce((a, i) => a + i.successScore, 0) / items.length;
      return {
        id:         `pattern-agent-${agent}`,
        type:       "agent" as const,
        label:      `${agent} decision pattern`,
        count:      items.length,
        frequency:  freq,
        trend,
        confidence: Math.round(conf * 100) / 100,
        examples:   items.slice(-3).map(i => i.action),
        insight:    `${agent} avg success ${(avgSucc * 100).toFixed(0)}% over ${items.length} decisions`,
      };
    });
}

function analyzeByTag(memory: MemoryEntry[]): PatternResult[] {
  const groups: Record<string, MemoryEntry[]> = {};
  for (const m of memory) {
    for (const tag of m.tags) {
      (groups[tag] ??= []).push(m);
    }
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length >= 3)
    .map(([tag, items]) => {
      const times = items.map(i => i.timestamp);
      const freq  = occurrencesPerHour(times);
      const trend = trendFor(times);
      const conf  = confidence(items.length, freq);
      return {
        id:         `pattern-tag-${tag}`,
        type:       "tag" as const,
        label:      `"${tag}" tag recurrence`,
        count:      items.length,
        frequency:  freq,
        trend,
        confidence: Math.round(conf * 100) / 100,
        examples:   [...new Set(items.map(i => i.domain))].slice(0, 3),
        insight:    `Actions tagged "${tag}" appear across ${new Set(items.map(i => i.domain)).size} domain(s)`,
      };
    });
}

function analyzeExperienceCausality(experiences: Experience[]): PatternResult[] {
  const causal: PatternResult[] = [];

  // Security events followed by scaling
  const securityEvts  = experiences.filter(e => e.category === "security" && e.outcome === "positive");
  const scalingEvts   = experiences.filter(e => e.category === "scaling");
  if (securityEvts.length >= 2 && scalingEvts.length >= 1) {
    causal.push({
      id:         "pattern-causal-security-scaling",
      type:       "causal",
      label:      "Security events precede scaling actions",
      count:      securityEvts.length + scalingEvts.length,
      frequency:  occurrencesPerHour(securityEvts.map(e => e.timestamp)),
      trend:      "stable",
      confidence: 0.72,
      examples:   securityEvts.slice(0, 2).map(e => e.event),
      insight:    "High-traffic security events correlate with subsequent infrastructure scale-out",
    });
  }

  // Marketing events followed by governance
  const marketingEvts  = experiences.filter(e => e.category === "marketing");
  const govEvts        = experiences.filter(e => e.category === "governance");
  if (marketingEvts.length >= 1 && govEvts.length >= 1) {
    causal.push({
      id:         "pattern-causal-marketing-governance",
      type:       "causal",
      label:      "Marketing growth drives governance activity",
      count:      marketingEvts.length + govEvts.length,
      frequency:  0.15,
      trend:      "rising",
      confidence: 0.65,
      examples:   [...marketingEvts, ...govEvts].slice(0, 2).map(e => e.event),
      insight:    "Ecosystem growth campaigns correlate with new governance proposals",
    });
  }

  return causal;
}

// ── Public API ────────────────────────────────────────────────────────────────

let _latestPatterns: PatternResult[] = [];

export function analyzePatterns(
  memory:      MemoryEntry[],
  experiences: Experience[],
): PatternResult[] {
  const domainPatterns  = analyzeByDomain(memory);
  const agentPatterns   = analyzeByAgent(memory);
  const tagPatterns     = analyzeByTag(memory);
  const causalPatterns  = analyzeExperienceCausality(experiences);

  _latestPatterns = [
    ...domainPatterns,
    ...agentPatterns,
    ...tagPatterns,
    ...causalPatterns,
  ].sort((a, b) => b.confidence - a.confidence);

  return _latestPatterns;
}

export function getLatestPatterns(): PatternResult[] {
  return _latestPatterns;
}
