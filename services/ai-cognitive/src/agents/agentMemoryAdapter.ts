/**
 * GCL — Agent Memory Adapter
 * Bridge layer between external AI agents and the cognitive store.
 * Agents call storeAgentDecision() to persist outcomes; the cognitive
 * layer then learns from the accumulated history.
 */

import {
  saveMemory,
  getMemoryByAgent,
  getMemoryStats,
  type MemoryEntry,
} from "../memory/longTermMemory";
import { getLatestInsights }  from "../learning/learningEngine";
import { getLatestPatterns }  from "../learning/patternAnalyzer";
import { getAllStrategies }   from "../evolution/strategyEvolution";
import { getGraphStats }      from "../knowledge/knowledgeGraph";
import { v4 as uuid }         from "uuid";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImpactLevel = "low" | "medium" | "high" | "critical";

export interface AgentInsight {
  agentId:       string;
  recentMemory:  MemoryEntry[];
  topPatterns:   ReturnType<typeof getLatestPatterns>;
  topInsights:   ReturnType<typeof getLatestInsights>;
}

export interface CognitiveSnapshot {
  timestamp:        number;
  memoryStats:      ReturnType<typeof getMemoryStats>;
  strategiesCount:  number;
  graphStats:       ReturnType<typeof getGraphStats>;
  topInsightCount:  number;
  topPatternCount:  number;
  systemStatus:     "healthy" | "learning" | "degraded";
}

// ── Write ─────────────────────────────────────────────────────────────────────

export function storeAgentDecision(opts: {
  agent:        string;
  domain:       string;
  action:       string;
  reasoning:    string;
  outcome:      string;
  impact:       ImpactLevel;
  success:      boolean;
  successScore: number;     // 0.0 – 1.0
  tags:         string[];
}): MemoryEntry {
  const entry: MemoryEntry = {
    id:           uuid(),
    timestamp:    Date.now(),
    agent:        opts.agent,
    domain:       opts.domain,
    action:       opts.action,
    reasoning:    opts.reasoning,
    outcome:      opts.outcome,
    impact:       opts.impact,
    success:      opts.success,
    successScore: Math.max(0, Math.min(1, opts.successScore)),
    tags:         opts.tags,
  };
  saveMemory(entry);
  return entry;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getAgentInsights(agentId: string): AgentInsight {
  const recentMemory = getMemoryByAgent(agentId).slice(-20);
  const topPatterns  = getLatestPatterns()
    .filter(p => p.type === "agent" && p.label.includes(agentId))
    .slice(0, 5);
  const topInsights  = getLatestInsights()
    .filter(i => i.agent === agentId)
    .slice(0, 5);

  return { agentId, recentMemory, topPatterns, topInsights };
}

export function getCognitiveSnapshot(): CognitiveSnapshot {
  const memStats        = getMemoryStats();
  const strategies      = getAllStrategies();
  const graphStats      = getGraphStats();
  const insights        = getLatestInsights();
  const patterns        = getLatestPatterns();

  // Determine status
  let systemStatus: CognitiveSnapshot["systemStatus"] = "healthy";
  if (insights.length === 0 && memStats.total < 5) {
    systemStatus = "learning";   // not enough data yet
  } else if (memStats.avgSuccessScore < 0.5) {
    systemStatus = "degraded";
  }

  return {
    timestamp:       Date.now(),
    memoryStats:     memStats,
    strategiesCount: strategies.length,
    graphStats,
    topInsightCount: insights.length,
    topPatternCount: patterns.length,
    systemStatus,
  };
}
