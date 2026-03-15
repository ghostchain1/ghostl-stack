/**
 * nodeScaler.ts — Blockchain node auto-scaling engine
 *
 * Monitors network load across L1, L2 and L3 layers by polling the chain
 * telemetry endpoint or falling back to local CPU load as a proxy metric.
 * When load crosses a threshold a scale-out decision is recorded; the AIE
 * can optionally provision a new node via Docker Compose (dry-run by default).
 *
 * Set AIE_SCALING_ENABLED=true to enable live compose-based scale-out.
 */

import * as os from "os";
import axios from "axios";
import logger from "../utils/logger";

export type Layer = "L1" | "L2" | "L3";

export interface NetworkMetrics {
  layer: Layer;
  tps: number;
  blockTime: number;
  validatorCount: number;
  loadPercent: number;
  timestamp: string;
}

export interface ScalingDecision {
  timestamp: string;
  layer: Layer;
  trigger: string;
  loadPercent: number;
  action: "scale-out" | "scale-in" | "hold";
  executed: boolean;
  dryRun: boolean;
  note?: string;
}

const SCALE_OUT_THRESHOLD = Number(process.env.AIE_SCALE_OUT_THRESHOLD ?? 70);
const SCALE_IN_THRESHOLD  = Number(process.env.AIE_SCALE_IN_THRESHOLD  ?? 30);
const SCALING_ENABLED     = process.env.AIE_SCALING_ENABLED === "true";

const GIN_URL   = process.env.GIN_URL   ?? "http://localhost:9980";

const decisions: ScalingDecision[] = [];
const MAX_LOG = 200;

// ── Metrics collection ────────────────────────────────────────────────────────

async function fetchLayerMetrics(layer: Layer): Promise<NetworkMetrics | null> {
  try {
    const r = await axios.get(`${GIN_URL}/chains/${layer.toLowerCase()}/metrics`, { timeout: 3000 });
    const d = r.data as Record<string, number>;
    return {
      layer,
      tps:            d.tps            ?? 0,
      blockTime:      d.blockTime      ?? 0,
      validatorCount: d.validatorCount ?? 0,
      loadPercent:    d.loadPercent    ?? 0,
      timestamp:      new Date().toISOString(),
    };
  } catch {
    // Fallback: use local CPU load as a proxy for network load
    const load  = os.loadavg()[0];
    const cores = os.cpus().length;
    const loadPercent = Math.min(100, Math.round((load / cores) * 100 * 10) / 10);
    return { layer, tps: 0, blockTime: 0, validatorCount: 0, loadPercent, timestamp: new Date().toISOString() };
  }
}

// ── Scaling action ─────────────────────────────────────────────────────────────

async function triggerScaleOut(layer: Layer, dryRun: boolean): Promise<{ executed: boolean; note: string }> {
  const composeService = `ghostchain-${layer.toLowerCase()}-node`;
  if (dryRun) {
    logger.info(`[NodeScaler] DRY-RUN: docker compose up --scale ${composeService}=+1`);
    return { executed: false, note: "dry-run" };
  }
  try {
    const { spawn } = await import("child_process");
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("docker", ["compose", "up", "--scale", `${composeService}=+1`, "-d"], {
        stdio: "ignore",
        env: { ...process.env },
      });
      proc.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`exit ${code}`)),
      );
    });
    return { executed: true, note: `Scaled out ${layer} node` };
  } catch (err) {
    return { executed: false, note: `Scale-out failed: ${String(err)}` };
  }
}

// ── Main cycle ────────────────────────────────────────────────────────────────

export async function scaleNodes(): Promise<ScalingDecision[]> {
  const layers: Layer[] = ["L1", "L2", "L3"];
  const cycleDecisions: ScalingDecision[] = [];

  for (const layer of layers) {
    const metrics = await fetchLayerMetrics(layer);
    if (!metrics) continue;

    let action: ScalingDecision["action"] = "hold";
    let note: string | undefined;
    let executed = false;

    if (metrics.loadPercent >= SCALE_OUT_THRESHOLD) {
      action = "scale-out";
      const result = await triggerScaleOut(layer, !SCALING_ENABLED);
      executed = result.executed;
      note     = result.note;
      logger.warn(`[NodeScaler] ${layer} load ${metrics.loadPercent}% → scale-out`, { note });
    } else if (metrics.loadPercent <= SCALE_IN_THRESHOLD) {
      action = "scale-in";
      note   = "Load below threshold — scale-in opportunity (manual)";
      logger.info(`[NodeScaler] ${layer} load ${metrics.loadPercent}% → scale-in candidate`);
    }

    const decision: ScalingDecision = {
      timestamp:   new Date().toISOString(),
      layer,
      trigger:     `load=${metrics.loadPercent}%`,
      loadPercent: metrics.loadPercent,
      action,
      executed,
      dryRun:      !SCALING_ENABLED,
      note,
    };

    if (action !== "hold") {
      cycleDecisions.push(decision);
      decisions.unshift(decision);
      if (decisions.length > MAX_LOG) decisions.pop();
    }
  }

  return cycleDecisions;
}

export function getScalingLog(): ScalingDecision[] { return decisions.slice(0, 50); }
