/**
 * Interplanetary Routing Optimizer
 * Computes optimal relay paths across the solar-system node mesh.
 * Optionally requests AI routing suggestions via ghost-ai-swarm-v2.
 */
import {
  type InterplanetaryRoute,
  type RouteHop,
  estimateLatencyMs,
} from "ghost-interplanetary-sdk";
import { getAllNodes, getOnline } from "./nodeRegistry.js";

const AI_SWARM_URL = process.env.AI_SWARM_URL ?? "http://localhost:7970";
const OPTIMIZE_INTERVAL_MS = Number(process.env.OPTIMIZE_INTERVAL_MS ?? 300_000);

const routeCache = new Map<string, InterplanetaryRoute>();
let _timer: ReturnType<typeof setInterval> | null = null;

function routeKey(from: string, to: string): string {
  return `${from}→${to}`;
}

/** Compute direct route between two nodes using known latency profiles. */
export function computeRoute(fromId: string, toId: string): InterplanetaryRoute | null {
  const all = getAllNodes();
  const from = all.find((n) => n.id === fromId);
  const to = all.find((n) => n.id === toId);
  if (!from || !to) return null;

  // Direct hop if both ends known
  const latency = estimateLatencyMs(from.environment, to.environment);
  const hop: RouteHop = {
    nodeId: toId,
    latencyMs: latency,
    reliable: to.online,
  };

  const route: InterplanetaryRoute = {
    sourceNodeId: fromId,
    destNodeId: toId,
    hops: [hop],
    totalLatencyMs: latency,
    reliability: to.online ? 0.95 : 0.3,
    computedAt: Date.now(),
  };
  routeCache.set(routeKey(fromId, toId), route);
  return route;
}

/** Return full topology: routes from every online node to every other. */
export function buildTopology(): InterplanetaryRoute[] {
  const nodes = getOnline();
  const routes: InterplanetaryRoute[] = [];
  for (const src of nodes) {
    for (const dst of nodes) {
      if (src.id === dst.id) continue;
      const r = computeRoute(src.id, dst.id);
      if (r) routes.push(r);
    }
  }
  return routes;
}

export function getCachedRoute(fromId: string, toId: string): InterplanetaryRoute | null {
  return routeCache.get(routeKey(fromId, toId)) ?? null;
}

export function getAllCachedRoutes(): InterplanetaryRoute[] {
  return [...routeCache.values()];
}

/**
 * Request AI routing optimization from ghost-ai-swarm-v2.
 * Returns suggestions list (may be empty if swarm unavailable).
 */
export async function requestAiOptimization(): Promise<string[]> {
  const topology = buildTopology();
  try {
    const res = await fetch(`${AI_SWARM_URL}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetRole: "network",
        type: "optimize-routing",
        payload: { topology },
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { suggestions?: string[] };
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

/** Start periodic route re-computation. */
export function scheduleOptimization(): void {
  if (_timer) return;
  _timer = setInterval(() => {
    buildTopology(); // refreshes routeCache
  }, OPTIMIZE_INTERVAL_MS);
}

export function stopOptimization(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
