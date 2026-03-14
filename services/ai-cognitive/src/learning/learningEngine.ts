/**
 * GCL — Learning Engine
 * Derives high-level insights from historical memory entries and
 * produces ranked recommendations per agent and domain.
 */

import type { MemoryEntry } from "../memory/longTermMemory";

export interface LearningInsight {
  id:              string;
  pattern:         string;      // natural-language description
  domain:          string;
  agent:           string;
  confidence:      number;      // 0.0 – 1.0
  recommendation:  string;
  basedOnEntries:  number;
  avgSuccessScore: number;
}

// ── Core Analysis ─────────────────────────────────────────────────────────────

function groupBy<T>(items: T[], key: (i: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function learnFromHistory(memory: MemoryEntry[]): LearningInsight[] {
  const successful = memory.filter(m => m.success && m.successScore >= 0.6);
  if (successful.length < 3) return [];

  const insights: LearningInsight[] = [];

  // --- Per-domain analysis ---
  const byDomain = groupBy(successful, m => m.domain);
  for (const [domain, entries] of Object.entries(byDomain)) {
    if (entries.length < 2) continue;

    const avgScore   = avg(entries.map(e => e.successScore));
    const agentMap   = groupBy(entries, e => e.agent);
    const topAgent   = Object.entries(agentMap).sort((a, b) => b[1].length - a[1].length)[0];
    const confidence = Math.min(0.98, 0.5 + entries.length * 0.06 + avgScore * 0.3);

    const sample = entries.slice(-3).map(e => e.action).join("; ");
    insights.push({
      id:             `insight-domain-${domain}`,
      pattern:        `${domain} domain has consistently high-success actions (avg ${(avgScore * 100).toFixed(0)}%)`,
      domain,
      agent:          topAgent ? topAgent[0] : "unknown",
      confidence:     Math.round(confidence * 100) / 100,
      recommendation: `Prioritize ${domain} actions from ${topAgent?.[0] ?? "top agents"}. Recent: ${sample}`,
      basedOnEntries: entries.length,
      avgSuccessScore: Math.round(avgScore * 100) / 100,
    });
  }

  // --- Per-agent analysis ---
  const byAgent = groupBy(successful, m => m.agent);
  for (const [agent, entries] of Object.entries(byAgent)) {
    if (entries.length < 2) continue;

    const avgScore   = avg(entries.map(e => e.successScore));
    const domains    = [...new Set(entries.map(e => e.domain))];
    const confidence = Math.min(0.96, 0.45 + entries.length * 0.08 + avgScore * 0.35);
    const topDomain  = (groupBy(entries, e => e.domain));
    const bestDomain = Object.entries(topDomain).sort((a, b) => b[1].length - a[1].length)[0]?.[0];

    insights.push({
      id:             `insight-agent-${agent}`,
      pattern:        `${agent} consistently performs well across ${domains.length} domain(s)`,
      domain:         bestDomain ?? domains[0] ?? "mixed",
      agent,
      confidence:     Math.round(confidence * 100) / 100,
      recommendation: `Deploy ${agent} for ${bestDomain ?? domains[0]} tasks; avg score ${(avgScore * 100).toFixed(0)}%`,
      basedOnEntries: entries.length,
      avgSuccessScore: Math.round(avgScore * 100) / 100,
    });
  }

  // --- Tag-based pattern analysis ---
  const tagCounts: Record<string, { entries: MemoryEntry[]; scores: number[] }> = {};
  for (const entry of successful) {
    for (const tag of entry.tags) {
      (tagCounts[tag] ??= { entries: [], scores: [] }).entries.push(entry);
      tagCounts[tag].scores.push(entry.successScore);
    }
  }

  for (const [tag, { entries, scores }] of Object.entries(tagCounts)) {
    if (entries.length < 3) continue;
    const avgScore   = avg(scores);
    const domains    = [...new Set(entries.map(e => e.domain))];
    const confidence = Math.min(0.95, 0.4 + entries.length * 0.07 + avgScore * 0.3);

    insights.push({
      id:             `insight-tag-${tag}`,
      pattern:        `Tag "${tag}" correlates with high success across ${domains.join(", ")}`,
      domain:         domains.join(", "),
      agent:          "multi-agent",
      confidence:     Math.round(confidence * 100) / 100,
      recommendation: `Prefer strategies tagged "${tag}" — proven across ${entries.length} decisions`,
      basedOnEntries: entries.length,
      avgSuccessScore: Math.round(avgScore * 100) / 100,
    });
  }

  return insights
    .sort((a, b) => b.confidence - a.confidence)
    .filter((v, i, arr) => i === 0 || v.id !== arr[i - 1].id); // dedupe
}

// ── Live Cycle ─────────────────────────────────────────────────────────────────

let _latestInsights: LearningInsight[] = [];

export function runLearningCycle(memory: MemoryEntry[]): LearningInsight[] {
  _latestInsights = learnFromHistory(memory);
  return _latestInsights;
}

export function getLatestInsights(): LearningInsight[] {
  return _latestInsights;
}
