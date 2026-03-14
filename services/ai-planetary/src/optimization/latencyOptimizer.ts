/**
 * Latency Optimizer — measures inter-region latencies and deploys edge nodes to reduce them.
 */

import { v4 as uuid } from "uuid";
import logger          from "../utils/logger";
import { REGIONS }     from "../deployment/globalNodeDeploy";

export interface LatencyEntry {
  fromRegion: string;
  toRegion:   string;
  latency_ms: number;
  hops:       number;
  protocol:   "tcp" | "quic" | "udp";
  measuredAt: number;
}

export type EdgeActionType = "deploy-edge-node" | "upgrade-route" | "add-cdn-pop" | "bgp-optimization" | "anycasting";

export interface EdgeAction {
  id:                  string;
  fromRegion:          string;
  toRegion:            string;
  actionType:          EdgeActionType;
  reason:              string;
  expectedImprovement: number;   // ms reduction
  actualImprovement?:  number;
  status:              "scheduled" | "in-progress" | "completed" | "failed";
  triggeredAt:         number;
  completedAt?:        number;
}

const matrix: LatencyEntry[] = [];
const actions: EdgeAction[]  = [];

function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pick<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]!; }

// Realistic baseline inter-region latencies (ms)
const BASELINE_MAP: Record<string, Record<string, number>> = {
  "us-east":    { "us-west": 70,  "us-central": 20,  "eu-west": 90,  "eu-central": 100, "ap-east": 190, "ap-south": 210, "sa-east": 130, "af-south": 200, "me-south": 180, "in-south": 220, "ca-central": 15,  "ap-sydney": 250 },
  "us-west":    { "us-east": 70,  "us-central": 55,  "eu-west": 155, "eu-central": 165, "ap-east": 120, "ap-south": 175, "sa-east": 195, "af-south": 260, "me-south": 230, "in-south": 200, "ca-central": 75,  "ap-sydney": 170 },
  "eu-west":    { "us-east": 90,  "us-west": 155, "eu-central": 25, "ap-east": 240, "ap-south": 175, "sa-east": 185, "af-south": 160, "me-south": 130, "in-south": 155, "ca-central": 95,  "ap-sydney": 320 },
  "eu-central": { "us-east": 100, "us-west": 165, "eu-west": 25, "eu-north": 20, "ap-east": 250, "ap-south": 165, "sa-east": 200, "af-south": 165, "me-south": 120, "in-south": 145, "ca-central": 105, "ap-sydney": 330 },
  "eu-north":   { "us-east": 110, "eu-central": 20, "eu-west": 30, "ap-east": 265, "ap-south": 175, "sa-east": 215, "af-south": 180, "me-south": 135, "in-south": 155, "ca-central": 110, "ap-sydney": 340 },
  "ap-east":    { "us-east": 190, "us-west": 120, "eu-west": 240, "ap-south": 70, "ap-sydney": 105, "sa-east": 310, "af-south": 320, "me-south": 170, "in-south": 95, "ca-central": 195, "kr-seoul": 5, "jp-osaka": 3 },
  "ap-south":   { "us-east": 210, "us-west": 175, "eu-west": 175, "ap-east": 70, "ap-sydney": 130, "sa-east": 345, "af-south": 220, "me-south": 130, "in-south": 55,  "ca-central": 215 },
  "ap-sydney":  { "us-east": 250, "us-west": 170, "eu-west": 320, "ap-east": 105, "ap-south": 130, "sa-east": 290, "af-south": 380, "me-south": 270, "in-south": 175, "ca-central": 255, "au-perth": 35 },
  "sa-east":    { "us-east": 130, "us-west": 195, "eu-west": 185, "ap-east": 310, "ap-south": 345, "af-south": 270, "me-south": 295, "in-south": 330, "ca-central": 135 },
  "af-south":   { "us-east": 200, "us-west": 260, "eu-west": 160, "ap-east": 320, "ap-south": 220, "sa-east": 270, "me-south": 145, "in-south": 185, "ca-central": 205, "za-jhb": 15 },
  "me-south":   { "us-east": 180, "us-west": 230, "eu-west": 130, "eu-central": 120, "ap-east": 170, "ap-south": 130, "sa-east": 295, "af-south": 145, "in-south": 100, "ca-central": 185 },
  "in-south":   { "us-east": 220, "us-west": 200, "eu-west": 155, "ap-east": 95, "ap-south": 55, "sa-east": 330, "af-south": 185, "me-south": 100, "ca-central": 225 },
  "ca-central": { "us-east": 15,  "us-west": 75, "eu-west": 95, "eu-central": 105, "ap-east": 195, "ap-south": 215, "sa-east": 135, "af-south": 205, "me-south": 185, "in-south": 225 },
};

const PROTOCOLS: ("tcp" | "quic" | "udp")[] = ["tcp", "quic", "udp"];
const ACTION_TYPES: EdgeActionType[] = ["deploy-edge-node","upgrade-route","add-cdn-pop","bgp-optimization","anycasting"];

function seedMatrix() {
  const regionIds = REGIONS.map(r => r.id);
  regionIds.forEach(from => {
    regionIds.forEach(to => {
      if (from === to) return;
      const baseline = BASELINE_MAP[from]?.[to] ?? BASELINE_MAP[to]?.[from] ?? rand(70, 400);
      matrix.push({
        fromRegion: from,
        toRegion:   to,
        latency_ms: baseline + rand(-10, 20),
        hops:       rand(2, 18),
        protocol:   pick(PROTOCOLS),
        measuredAt: Date.now() - rand(0, 3600) * 1000,
      });
    });
  });
  logger.info(`[LatencyOptimizer] Seeded ${matrix.length} latency matrix entries`);
}

export function optimizeLatency(): EdgeAction[] {
  const newActions: EdgeAction[] = [];
  const highLatencyPairs = matrix.filter(e => e.latency_ms > 200 && e.fromRegion !== e.toRegion);

  const toFix = highLatencyPairs.slice(0, 3);
  toFix.forEach(pair => {
    const alreadyScheduled = actions.find(
      a => a.fromRegion === pair.fromRegion && a.toRegion === pair.toRegion && a.status !== "completed" && a.status !== "failed"
    );
    if (alreadyScheduled) return;

    const expected = Math.min(rand(15, 60), Math.floor(pair.latency_ms * 0.25));
    const action: EdgeAction = {
      id:                  uuid(),
      fromRegion:          pair.fromRegion,
      toRegion:            pair.toRegion,
      actionType:          pick(ACTION_TYPES),
      reason:              `Latency ${pair.latency_ms}ms exceeds 200ms SLA`,
      expectedImprovement: expected,
      status:              "scheduled",
      triggeredAt:         Date.now(),
    };
    actions.unshift(action);
    newActions.push(action);

    // Simulate async completion
    setTimeout(() => {
      action.status = "in-progress";
      setTimeout(() => {
        action.status          = "completed";
        action.actualImprovement = rand(Math.floor(expected * 0.7), expected + 10);
        action.completedAt     = Date.now();
        // Update matrix entry
        const entry = matrix.find(e => e.fromRegion === pair.fromRegion && e.toRegion === pair.toRegion);
        if (entry) { entry.latency_ms = Math.max(50, entry.latency_ms - (action.actualImprovement ?? 0)); entry.measuredAt = Date.now(); }
      }, rand(4000, 12000));
    }, rand(1000, 3000));
  });

  if (newActions.length) {
    logger.info(`[LatencyOptimizer] Triggered ${newActions.length} optimization action(s)`);
  } else {
    logger.info("[LatencyOptimizer] No high-latency routes to optimize right now");
  }
  return newActions;
}

export function getLatencyMatrix(fromRegion?: string, toRegion?: string): LatencyEntry[] {
  let entries = [...matrix];
  if (fromRegion) entries = entries.filter(e => e.fromRegion === fromRegion);
  if (toRegion)   entries = entries.filter(e => e.toRegion   === toRegion);
  return entries;
}

export function getEdgeActions(limit = 50): EdgeAction[] {
  return actions.slice(0, limit);
}

export function getLatencyStats() {
  const values = matrix.map(e => e.latency_ms);
  const avg    = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0;
  const max    = values.length ? Math.max(...values) : 0;
  const min    = values.length ? Math.min(...values) : 0;
  const high   = matrix.filter(e => e.latency_ms > 200).length;
  return {
    matrixEntries:    matrix.length,
    avgLatency_ms:    avg,
    maxLatency_ms:    max,
    minLatency_ms:    min,
    highLatencyPairs: high,
    actionsScheduled: actions.filter(a => a.status === "scheduled").length,
    actionsCompleted: actions.filter(a => a.status === "completed").length,
    totalActions:     actions.length,
  };
}

seedMatrix();
