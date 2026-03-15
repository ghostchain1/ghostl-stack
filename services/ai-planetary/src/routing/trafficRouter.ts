/**
 * Traffic Router — intelligently routes user requests to the lowest-latency online node.
 */

import { v4 as uuid } from "uuid";
import logger          from "../utils/logger";
import { GlobalNode, getNodes, REGIONS, RegionInfo } from "../deployment/globalNodeDeploy";

export type RouteProtocol = "http" | "ws" | "grpc";
export type RouteStatus   = "active" | "degraded" | "rerouted" | "failed";

export interface TrafficRoute {
  id:             string;
  userRegion:     RegionInfo;
  targetNode:     Pick<GlobalNode, "id" | "name" | "region" | "ip" | "rpcPort">;
  protocol:       RouteProtocol;
  status:         RouteStatus;
  latency_ms:     number;
  bytesRouted:    number;
  requestsRouted: number;
  errorRate:      number;  // %
  createdAt:      number;
  lastRouted:     number;
}

export interface RoutingDecision {
  userRegion:    string;
  selectedNode:  string;
  latency_ms:    number;
  protocol:      RouteProtocol;
  reason:        string;
  decisionAt:    number;
}

const routes:    TrafficRoute[]   = [];
const decisions: RoutingDecision[] = [];
const MAX_DECISIONS = 500;

function rand(a: number, b: number)  { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randf(a: number, b: number) { return parseFloat((Math.random() * (b - a) + a).toFixed(2)); }
function pick<T>(arr: T[]): T       { return arr[Math.floor(Math.random() * arr.length)]!; }

const PROTOCOLS: RouteProtocol[] = ["http", "ws", "grpc"];

function buildRoute(userRegion: RegionInfo, node: GlobalNode, protocol: RouteProtocol): TrafficRoute {
  const active = node.status === "online";
  return {
    id:             uuid(),
    userRegion,
    targetNode:     { id: node.id, name: node.name, region: node.region, ip: node.ip, rpcPort: node.rpcPort },
    protocol,
    status:         active ? (Math.random() > 0.9 ? "degraded" : "active") : "failed",
    latency_ms:     active ? rand(5, 350) : 9999,
    bytesRouted:    rand(1_000_000, 500_000_000),
    requestsRouted: rand(100, 10_000_000),
    errorRate:      active ? randf(0, 2) : randf(5, 30),
    createdAt:      Date.now() - rand(1, 720) * 3_600_000,
    lastRouted:     Date.now() - rand(0, 3600) * 1000,
  };
}

function seed() {
  const onlineNodes = getNodes({ limit: 200 }).filter(n => n.status === "online");
  if (!onlineNodes.length) {
    logger.warn("[TrafficRouter] No online nodes for route seeding");
    return;
  }
  REGIONS.slice(0, 12).forEach(region => {
    const node     = pick(onlineNodes);
    const protocol = pick(PROTOCOLS);
    routes.push(buildRoute(region, node, protocol));
  });
  logger.info(`[TrafficRouter] Seeded ${routes.length} active routes`);
}

export function routeTraffic(userRegionId: string, protocol: RouteProtocol = "http"): TrafficRoute {
  const userRegion = REGIONS.find(r => r.id === userRegionId) ?? pick(REGIONS);
  const online     = getNodes({ limit: 200 }).filter(n => n.status === "online");

  if (!online.length) throw new Error("No online nodes available for routing");

  // Prefer same region, then same continent, then lowest latency globally
  const sameRegion    = online.filter(n => n.region.id === userRegionId);
  const sameContinent = online.filter(n => n.region.continent === userRegion.continent);
  const pool          = sameRegion.length ? sameRegion : sameContinent.length ? sameContinent : online;
  const best          = pool.reduce((a, b) => a.latency_ms <= b.latency_ms ? a : b);

  const existing = routes.find(r => r.userRegion.id === userRegionId && r.protocol === protocol && r.status !== "failed");
  if (existing) {
    existing.requestsRouted++;
    existing.bytesRouted += rand(1000, 50000);
    existing.lastRouted   = Date.now();
    existing.latency_ms   = best.latency_ms + rand(-5, 10);
    existing.status       = "active";
    recordDecision(userRegion, best, protocol, "reused existing route");
    return existing;
  }

  const route = buildRoute(userRegion, best, protocol);
  routes.unshift(route);
  if (routes.length > 1000) routes.pop();
  recordDecision(userRegion, best, protocol, sameRegion.length ? "same-region match" : sameContinent.length ? "continent fallback" : "global lowest latency");
  logger.info(`[TrafficRouter] Routed ${userRegionId} → ${best.name} (${best.latency_ms}ms)`);
  return route;
}

function recordDecision(userRegion: RegionInfo, node: GlobalNode, protocol: RouteProtocol, reason: string) {
  decisions.unshift({ userRegion: userRegion.id, selectedNode: node.name, latency_ms: node.latency_ms, protocol, reason, decisionAt: Date.now() });
  if (decisions.length > MAX_DECISIONS) decisions.pop();
}

export function getRoutes(opts: { userRegionId?: string; protocol?: RouteProtocol; status?: RouteStatus; limit?: number } = {}): TrafficRoute[] {
  let list = [...routes];
  if (opts.userRegionId) list = list.filter(r => r.userRegion.id === opts.userRegionId);
  if (opts.protocol)     list = list.filter(r => r.protocol       === opts.protocol);
  if (opts.status)       list = list.filter(r => r.status         === opts.status);
  return list.slice(0, opts.limit ?? 50);
}

export function getDecisions(limit = 50): RoutingDecision[] {
  return decisions.slice(0, limit);
}

export function getRoutingStats() {
  const active   = routes.filter(r => r.status === "active").length;
  const degraded = routes.filter(r => r.status === "degraded").length;
  const failed   = routes.filter(r => r.status === "failed").length;
  const avgLat   = routes.length ? Math.round(routes.filter(r => r.status === "active").reduce((s, r) => s + r.latency_ms, 0) / Math.max(active, 1)) : 0;
  const totalReq = routes.reduce((s, r) => s + r.requestsRouted, 0);
  const totalBytes = routes.reduce((s, r) => s + r.bytesRouted, 0);
  return {
    totalRoutes: routes.length,
    activeRoutes: active,
    degradedRoutes: degraded,
    failedRoutes: failed,
    avgLatency_ms: avgLat,
    totalRequests: totalReq,
    totalBytesRouted: totalBytes,
    recentDecisions: decisions.length,
  };
}

seed();
