/**
 * Regional Infrastructure — models per-region node capacity, coverage, and health.
 */

import { v4 as uuid } from "uuid";
import logger          from "../utils/logger";
import { REGIONS, RegionInfo, getNodes } from "../deployment/globalNodeDeploy";

export interface RegionStats {
  regionId:       string;
  region:         RegionInfo;
  validators:     number;
  rpcGateways:    number;
  archiveNodes:   number;
  edgeNodes:      number;
  bootnodes:      number;
  lightNodes:     number;
  totalNodes:     number;
  onlineNodes:    number;
  healthScore:    number;   // 0–100
  avgLatency_ms:  number;
  peakTps:        number;
  avgTps:         number;
  coverage:       string[];  // chains covered
  lastUpdated:    number;
}

export interface RegionAction {
  id:             string;
  regionId:       string;
  action:         "expand-validators" | "add-rpc-gateway" | "add-archive" | "scale-edge" | "reduce-light";
  reason:         string;
  status:         "scheduled" | "in-progress" | "completed" | "failed";
  triggeredAt:    number;
  completedAt?:   number;
}

const statsStore:   Map<string, RegionStats> = new Map();
const actionsStore: RegionAction[] = [];

function rand(a: number, b: number)  { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randf(a: number, b: number) { return parseFloat((Math.random() * (b - a) + a).toFixed(1)); }

function computeRegionStats(region: RegionInfo): RegionStats {
  const nodes = getNodes({ regionId: region.id, limit: 200 });
  const validators   = nodes.filter(n => n.type === "validator").length;
  const rpcGateways  = nodes.filter(n => n.type === "rpc-gateway").length;
  const archiveNodes = nodes.filter(n => n.type === "archive").length;
  const edgeNodes    = nodes.filter(n => n.type === "edge").length;
  const bootnodes    = nodes.filter(n => n.type === "bootnode").length;
  const lightNodes   = nodes.filter(n => n.type === "light").length;
  const online       = nodes.filter(n => n.status === "online");
  const avgLatency   = online.length ? Math.round(online.reduce((s, n) => s + n.latency_ms, 0) / online.length) : 9999;
  const healthScore  = nodes.length ? Math.round((online.length / nodes.length) * 100) : 0;

  return {
    regionId:      region.id,
    region,
    validators,
    rpcGateways,
    archiveNodes,
    edgeNodes,
    bootnodes,
    lightNodes,
    totalNodes:    nodes.length,
    onlineNodes:   online.length,
    healthScore,
    avgLatency_ms: avgLatency,
    peakTps:       rand(800, 9000),
    avgTps:        rand(200, 4000),
    coverage:      [...new Set(nodes.map(n => n.network))],
    lastUpdated:   Date.now(),
  };
}

function seed() {
  REGIONS.forEach(region => {
    statsStore.set(region.id, computeRegionStats(region));
  });
  logger.info(`[RegionalInfra] Seeded stats for ${statsStore.size} regions`);
}

export function configureRegion(regionId?: string): RegionStats | RegionStats[] {
  if (regionId) {
    const region = REGIONS.find(r => r.id === regionId);
    if (!region) throw new Error(`Unknown region: ${regionId}`);
    const stats = computeRegionStats(region);
    statsStore.set(regionId, stats);

    // Decide if an expansion action is needed
    if (stats.validators < 2) {
      const action: RegionAction = {
        id: uuid(), regionId, action: "expand-validators",
        reason: `Only ${stats.validators} validator(s) in ${region.name}`,
        status: "scheduled", triggeredAt: Date.now(),
      };
      actionsStore.unshift(action);
      setTimeout(() => { action.status = "completed"; action.completedAt = Date.now(); }, rand(3000, 8000));
    }
    if (stats.rpcGateways < 1) {
      const action: RegionAction = {
        id: uuid(), regionId, action: "add-rpc-gateway",
        reason: `No RPC gateways in ${region.name}`,
        status: "scheduled", triggeredAt: Date.now(),
      };
      actionsStore.unshift(action);
      setTimeout(() => { action.status = "completed"; action.completedAt = Date.now(); }, rand(4000, 10000));
    }

    logger.info(`[RegionalInfra] Configured region ${regionId} — health ${stats.healthScore}%`);
    return stats;
  }

  const allStats: RegionStats[] = [];
  REGIONS.forEach(region => {
    const s = computeRegionStats(region);
    statsStore.set(region.id, s);
    allStats.push(s);
  });
  return allStats;
}

export function getRegionConfigs(): RegionStats[] {
  return [...statsStore.values()];
}

export function getRegionActions(limit = 50): RegionAction[] {
  return actionsStore.slice(0, limit);
}

export function getRegionStats() {
  const all = [...statsStore.values()];
  const healthy = all.filter(r => r.healthScore >= 80);
  const degraded = all.filter(r => r.healthScore >= 50 && r.healthScore < 80);
  const critical = all.filter(r => r.healthScore < 50);
  const avgHealth = all.length ? Math.round(all.reduce((s, r) => s + r.healthScore, 0) / all.length) : 0;
  const avgLatency = all.length ? Math.round(all.reduce((s, r) => s + r.avgLatency_ms, 0) / all.length) : 0;
  return {
    totalRegions: all.length,
    healthyRegions: healthy.length,
    degradedRegions: degraded.length,
    criticalRegions: critical.length,
    avgHealthScore: avgHealth,
    avgLatency_ms: avgLatency,
    totalNodes: all.reduce((s, r) => s + r.totalNodes, 0),
    onlineNodes: all.reduce((s, r) => s + r.onlineNodes, 0),
    actionsTriggered: actionsStore.length,
  };
}

seed();
