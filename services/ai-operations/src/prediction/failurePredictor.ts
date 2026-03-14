// ── Failure Predictor ─────────────────────────────────────────────────────────
// Assesses each node's failure risk using composite scoring from aiModels.
// Future versions can integrate ML models trained on historical incident data.

import { SystemMetrics, NodeMetrics } from "../monitoring/metricsCollector";
import { evaluateSystem, predictFailureProbability } from "../models/aiModels";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface FailurePrediction {
  nodeId:      string;
  label:       string;
  risk:        RiskLevel;
  prediction:  string;
  confidence:  number;   // 0–100
  score:       number;   // composite system score
  triggeredBy: string[]; // rule labels that raised risk
  timestamp:   number;
}

export interface PredictionReport {
  overallRisk:   RiskLevel;
  predictions:   FailurePrediction[];
  highRiskCount: number;
  timestamp:     number;
}

const RISK_MESSAGES: Record<RiskLevel, string> = {
  critical: "Imminent failure — immediate action required",
  high:     "Node overload imminent — consider scaling",
  medium:   "Performance degradation expected within hours",
  low:      "Operating within normal parameters",
};

function assessNode(node: NodeMetrics): FailurePrediction {
  // Offline nodes are always critical
  if (!node.online) {
    return {
      nodeId:      node.nodeId,
      label:       node.label,
      risk:        "critical",
      prediction:  "Node is offline",
      confidence:  100,
      score:       100,
      triggeredBy: ["node_offline"],
      timestamp:   Date.now(),
    };
  }

  const triggers: string[] = [];
  if (node.cpu     > 90)  triggers.push(`cpu_critical(${node.cpu.toFixed(0)}%)`);
  else if (node.cpu > 80) triggers.push(`cpu_high(${node.cpu.toFixed(0)}%)`);
  if (node.memory  > 85)  triggers.push(`memory_high(${node.memory.toFixed(0)}%)`);
  if (node.disk    > 90)  triggers.push(`disk_critical(${node.disk.toFixed(0)}%)`);
  if (node.latency > 500) triggers.push(`latency_high(${node.latency.toFixed(0)}ms)`);

  const score = evaluateSystem({
    cpu:     node.cpu,
    memory:  node.memory,
    network: Math.min(100, node.network / 10),
  });
  const prob = predictFailureProbability(node.cpu, node.memory, node.disk, node.latency);

  let risk: RiskLevel = "low";
  if      (prob > 75 || (node.cpu > 90 && node.memory > 85)) risk = "critical";
  else if (prob > 50 || node.cpu > 85 || node.disk > 90)     risk = "high";
  else if (prob > 25 || node.cpu > 70 || node.memory > 75)   risk = "medium";

  return {
    nodeId:      node.nodeId,
    label:       node.label,
    risk,
    prediction:  RISK_MESSAGES[risk],
    confidence:  Math.min(99, Math.round(prob + 10)),
    score:       Math.round(score),
    triggeredBy: triggers,
    timestamp:   Date.now(),
  };
}

export async function predictFailure(metrics: SystemMetrics): Promise<PredictionReport> {
  const predictions  = metrics.nodes.map(assessNode);
  const highRiskList = predictions.filter(p => p.risk === "high" || p.risk === "critical");

  let overallRisk: RiskLevel = "low";
  if (predictions.some(p => p.risk === "critical") || metrics.offlineNodes > 1) {
    overallRisk = "critical";
  } else if (predictions.some(p => p.risk === "high") || metrics.avgCpu > 80) {
    overallRisk = "high";
  } else if (predictions.some(p => p.risk === "medium") || metrics.avgCpu > 65) {
    overallRisk = "medium";
  }

  return {
    overallRisk,
    predictions,
    highRiskCount: highRiskList.length,
    timestamp:     Date.now(),
  };
}
