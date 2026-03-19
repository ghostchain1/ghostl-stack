/**
 * GhostBrain Core — Route Decision Helper
 *
 * Shared deterministic routing logic for WebSocket route planning.
 * This keeps the Fastify-attached WS server and the standalone WS server
 * aligned on explicit target-layer semantics.
 */

import { enforceRoutingLaw, type Layer, type TargetLayer } from "./routingLaw.js";

export interface GhostRoutePlan {
  path: Layer[];
  executeOn: Layer;
  targetLayer: TargetLayer;
  requiresMessaging: boolean;
  reason: string;
}

export interface GhostRouteDecision {
  plan: GhostRoutePlan;
  riskScore: number;
  notes?: string[];
}

type Json = Record<string, unknown>;

const DEFAULT_ROUTING_PATH: readonly Layer[] = ["L3", "L2", "L1"];

const SUSPICIOUS_SELECTORS = new Set([
  "0x095ea7b3", // approve
  "0x23b872dd", // transferFrom
  "0x3659cfe6", // upgradeTo
  "0xf2fde38b", // transferOwnership
]);

function isLayer(value: unknown): value is Layer {
  return value === "L1" || value === "L2" || value === "L3";
}

function isTargetLayer(value: unknown): value is TargetLayer {
  return isLayer(value) || value === "EXTERNAL";
}

function normalizeSourceLayer(value: unknown): Layer {
  return isLayer(value) ? value : "L3";
}

function normalizeTargetLayer(payload: Json, fallback: Layer): TargetLayer {
  const candidates = [
    payload["targetLayer"],
    payload["toLayer"],
    payload["destinationLayer"],
    payload["target"],
    payload["to"],
  ];

  for (const candidate of candidates) {
    if (isTargetLayer(candidate)) return candidate;
  }

  return fallback;
}

function normalizeSelector(value: unknown): string {
  return typeof value === "string" ? value : "0x";
}

function normalizeIntent(value: unknown): string {
  return typeof value === "string" ? value : "unknown";
}

export function buildGhostRoutePath(
  from: Layer,
  targetLayer: TargetLayer,
  routingPath: readonly Layer[] = DEFAULT_ROUTING_PATH,
): Layer[] {
  const terminalLayer: Layer = targetLayer === "EXTERNAL" ? "L1" : targetLayer;
  const fromIdx = routingPath.indexOf(from);
  const terminalIdx = routingPath.indexOf(terminalLayer);

  if (fromIdx === -1 || terminalIdx === -1) {
    throw new Error(`GhostBrain route planning failed: unknown layer mapping (${from} -> ${targetLayer})`);
  }

  if (fromIdx > terminalIdx) {
    throw new Error(`Policy jump blocked: ${from} → ${targetLayer}`);
  }

  const path = routingPath.slice(fromIdx, terminalIdx + 1) as Layer[];

  for (let i = 0; i < path.length - 1; i++) {
    const result = enforceRoutingLaw({
      sourceLayer: path[i]!,
      targetLayer: path[i + 1]!,
      intent: "TX",
    });
    if (!result.ok) throw new Error(result.reason);
  }

  if (targetLayer === "EXTERNAL") {
    const egress = enforceRoutingLaw({
      sourceLayer: path[path.length - 1]!,
      targetLayer: "EXTERNAL",
      intent: "TX",
    });
    if (!egress.ok) throw new Error(egress.reason);
  }

  return path;
}

export function decideGhostRoute(
  payload: Json,
  opts?: { routingPath?: readonly Layer[] },
): GhostRouteDecision {
  const routingPath = opts?.routingPath ?? DEFAULT_ROUTING_PATH;
  const from = normalizeSourceLayer(payload["from"]);
  const targetLayer = normalizeTargetLayer(payload, from);
  const selector = normalizeSelector(payload["selector"]).slice(0, 10).toLowerCase();
  const intent = normalizeIntent(payload["intent"]).toLowerCase();

  const path = buildGhostRoutePath(from, targetLayer, routingPath);
  const notes: string[] = [];
  let riskScore = path.length > 1 ? 0.2 : 0.05;

  if (path.length > 1) {
    notes.push(`Canonical hop path enforced: ${path.join(" → ")}`);
  }

  if (targetLayer === "EXTERNAL") {
    riskScore = Math.max(riskScore, 0.35);
    notes.push("External egress is terminated on GhostChain L1.");
  }

  if (intent === "bridge") {
    riskScore = Math.max(riskScore, 0.35);
    notes.push("Bridge intent requires relay-hop execution.");
  }

  if (SUSPICIOUS_SELECTORS.has(selector)) {
    riskScore = Math.max(riskScore, 0.55);
    notes.push("High-impact selector detected — escalate operator review.");
  }

  let reason = "GhostBrain same-layer routing";
  if (targetLayer === "EXTERNAL") {
    reason = "GhostBrain external egress routing";
  } else if (path.length > 1) {
    reason = "GhostBrain canonical hop routing";
  }

  return {
    plan: {
      path,
      executeOn: from,
      targetLayer,
      requiresMessaging: path.length > 1,
      reason,
    },
    riskScore,
    notes,
  };
}
