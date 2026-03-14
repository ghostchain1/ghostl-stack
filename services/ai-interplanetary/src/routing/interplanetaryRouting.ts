/**
 * Interplanetary Routing Engine
 * Routes blockchain messages through space nodes when terrestrial links fail.
 * Priority: terrestrial direct → satellite relay → orbital validator relay → deep-space hop.
 */
import { v4 as uuid } from "uuid";
import { logger } from "../utils/logger";
import { getRelays }     from "../satellites/satelliteRelay";
import { getValidators } from "../orbit/orbitalValidator";

export type RouteMode     = "terrestrial" | "satellite-relay" | "orbital-hop" | "deep-space";
export type RouteStatus   = "active" | "degraded" | "rerouted" | "failed";
export type RouteProtocol = "http" | "ws" | "grpc" | "dtls" | "quic";

export interface InterplanetaryRoute {
  id:              string;
  fromRegion:      string;
  toRegion:        string;
  mode:            RouteMode;
  protocol:        RouteProtocol;
  status:          RouteStatus;
  latency_ms:      number;
  hops:            string[];     // node/satellite/validator IDs
  bytesRouted:     number;
  requestsRouted:  number;
  errorRate:       number;       // 0-1
  createdAt:       number;
  lastRouted:      number;
}

export interface RoutingDecision {
  decisionId:   string;
  fromRegion:   string;
  toRegion:     string;
  selectedMode: RouteMode;
  selectedHop:  string;
  latency_ms:   number;
  protocol:     RouteProtocol;
  reason:       string;
  decisionAt:   number;
}

export interface FailoverEvent {
  id:           string;
  routeId:      string;
  fromMode:     RouteMode;
  toMode:       RouteMode;
  trigger:      string;
  latencyDelta: number;
  occurredAt:   number;
}

// ── Constants ────────────────────────────────────────────────────────────────
const MODE_LATENCY: Record<RouteMode, number> = {
  "terrestrial":     15,
  "satellite-relay": 40,
  "orbital-hop":     120,
  "deep-space":      2000,
};

const PROTOCOLS: RouteProtocol[] = ["http", "ws", "grpc", "dtls", "quic"];

const REGIONS = [
  "us-east", "us-west", "eu-west", "eu-central", "ap-east",
  "ap-south", "sa-east", "af-south", "me-south", "in-south",
];

const MAX_DECISIONS = 500;

function pickFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── In-memory store ──────────────────────────────────────────────────────────
const routes:    InterplanetaryRoute[] = [];
const decisions: RoutingDecision[]     = [];
const failovers: FailoverEvent[]       = [];

// Seed baseline routes
(function seed() {
  const now = Date.now();
  const pairs = [
    ["us-east",   "eu-west", "terrestrial",     "http"],
    ["us-east",   "ap-east", "satellite-relay", "grpc"],
    ["eu-west",   "ap-east", "satellite-relay", "ws"],
    ["af-south",  "eu-west", "orbital-hop",     "dtls"],
    ["in-south",  "us-east", "satellite-relay", "quic"],
    ["sa-east",   "eu-west", "terrestrial",     "http"],
    ["me-south",  "eu-west", "satellite-relay", "grpc"],
    ["ap-south",  "us-west", "satellite-relay", "quic"],
    ["us-west",   "ap-east", "terrestrial",     "grpc"],
    ["eu-central","af-south","orbital-hop",     "dtls"],
  ] as [string, string, RouteMode, RouteProtocol][];

  for (const [from, to, mode, protocol] of pairs) {
    const baseLatency = MODE_LATENCY[mode];
    routes.push({
      id:             uuid(),
      fromRegion:     from,
      toRegion:       to,
      mode,
      protocol,
      status:         Math.random() < 0.9 ? "active" : "degraded",
      latency_ms:     baseLatency + Math.floor(Math.random() * baseLatency * 0.3),
      hops:           [],
      bytesRouted:    Math.floor(Math.random() * 100_000_000),
      requestsRouted: Math.floor(Math.random() * 200_000),
      errorRate:      Math.random() * 0.03,
      createdAt:      now - Math.floor(Math.random() * 30 * 24 * 3600 * 1000),
      lastRouted:     now - Math.floor(Math.random() * 60_000),
    });
  }
  logger.info(`[interplanetaryRouting] seeded ${routes.length} routes`);
})();

// ── Public API ────────────────────────────────────────────────────────────────

export async function routeInterplanetary(
  fromRegion: string,
  toRegion:   string,
  payload:    unknown,
  protocol:   RouteProtocol = "grpc"
): Promise<{ decision: RoutingDecision; route: InterplanetaryRoute }> {
  // Find or create route
  let route = routes.find(r => r.fromRegion === fromRegion && r.toRegion === toRegion && r.status !== "failed");

  if (!route) {
    // Select mode: prefer terrestrial, fallback through tiers
    const activeSatellites  = getRelays({ status: "active" }).length;
    const activeValidators  = getValidators({ status: "active" }).length;
    const selectedMode: RouteMode =
      activeSatellites > 0 ? "satellite-relay" :
      activeValidators > 0 ? "orbital-hop"     : "deep-space";

    route = {
      id:             uuid(),
      fromRegion,
      toRegion,
      mode:           selectedMode,
      protocol,
      status:         "active",
      latency_ms:     MODE_LATENCY[selectedMode] + Math.floor(Math.random() * 20),
      hops:           [],
      bytesRouted:    0,
      requestsRouted: 0,
      errorRate:      0,
      createdAt:      Date.now(),
      lastRouted:     Date.now(),
    };
    routes.push(route);
  }

  // Update telemetry
  const payloadBytes = JSON.stringify(payload).length;
  route.bytesRouted     += payloadBytes;
  route.requestsRouted  += 1;
  route.lastRouted       = Date.now();

  // Determine hop label
  const activeSats = getRelays({ status: "active" });
  const activeVals = getValidators({ status: "active" });
  const hopLabel   =
    route.mode === "satellite-relay" && activeSats.length > 0
      ? pickFrom(activeSats).name
      : route.mode === "orbital-hop" && activeVals.length > 0
      ? pickFrom(activeVals).name
      : "direct";

  const decision: RoutingDecision = {
    decisionId:   uuid(),
    fromRegion,
    toRegion,
    selectedMode: route.mode,
    selectedHop:  hopLabel,
    latency_ms:   route.latency_ms,
    protocol:     route.protocol,
    reason: route.mode === "terrestrial"
      ? "Optimal terrestrial path available"
      : route.mode === "satellite-relay"
      ? `Routed via satellite: ${hopLabel}`
      : route.mode === "orbital-hop"
      ? `Routed via orbital validator: ${hopLabel}`
      : "Fallback deep-space relay",
    decisionAt:   Date.now(),
  };

  if (decisions.length >= MAX_DECISIONS) decisions.shift();
  decisions.push(decision);

  logger.info(`[interplanetaryRouting] ${fromRegion}→${toRegion} via ${route.mode} (${route.latency_ms}ms)`);
  return { decision, route };
}

export function getRoutes(opts: { mode?: RouteMode; status?: RouteStatus } = {}): InterplanetaryRoute[] {
  return routes.filter(r =>
    (!opts.mode   || r.mode   === opts.mode  ) &&
    (!opts.status || r.status === opts.status)
  );
}

export function getDecisions(limit = 50): RoutingDecision[] {
  return decisions.slice(-limit).reverse();
}

export function getFailovers(): FailoverEvent[] { return [...failovers].reverse(); }

export function getRoutingStats() {
  const total     = routes.length;
  const active    = routes.filter(r => r.status === "active").length;
  const byMode: Record<RouteMode, number> = {
    "terrestrial": 0, "satellite-relay": 0, "orbital-hop": 0, "deep-space": 0,
  };
  let totalReqs    = 0;
  let totalBytes   = 0;
  let sumLatency   = 0;
  let sumErrorRate = 0;

  for (const r of routes) {
    byMode[r.mode]++;
    totalReqs    += r.requestsRouted;
    totalBytes   += r.bytesRouted;
    sumLatency   += r.latency_ms;
    sumErrorRate += r.errorRate;
  }

  return {
    total, active, degraded: total - active,
    byMode,
    totalRequests:     totalReqs,
    totalBytesRouted:  totalBytes,
    avgLatency_ms:     total ? Math.round(sumLatency / total) : 0,
    avgErrorRate:      total ? sumErrorRate / total : 0,
    decisionsLogged:   decisions.length,
    failoversTotal:    failovers.length,
  };
}

// Internal tick: simulate failovers
export function tickRoutingMesh(): void {
  for (const r of routes) {
    if (r.status === "active" && Math.random() < 0.01) {
      const prevMode = r.mode;
      const modes: RouteMode[] = ["satellite-relay", "orbital-hop", "terrestrial", "deep-space"];
      const nextMode = modes.find(m => m !== r.mode) ?? "satellite-relay";
      const failover: FailoverEvent = {
        id:           uuid(),
        routeId:      r.id,
        fromMode:     prevMode,
        toMode:       nextMode,
        trigger:      "link-instability",
        latencyDelta: MODE_LATENCY[nextMode] - r.latency_ms,
        occurredAt:   Date.now(),
      };
      failovers.push(failover);
      r.mode       = nextMode;
      r.status     = "rerouted";
      r.latency_ms = MODE_LATENCY[nextMode] + Math.floor(Math.random() * 30);
      setTimeout(() => { r.status = "active"; }, 5000);
      logger.warn(`[interplanetaryRouting] failover ${r.fromRegion}→${r.toRegion}: ${prevMode}→${nextMode}`);
    }
  }
}
