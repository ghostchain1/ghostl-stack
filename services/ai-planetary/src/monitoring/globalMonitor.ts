/**
 * Global Monitor — continuous planetary health tracking with incident management.
 */

import { v4 as uuid } from "uuid";
import logger          from "../utils/logger";
import { getNodes, getNodeStats, REGIONS } from "../deployment/globalNodeDeploy";
import { getRegionStats }                  from "../regions/regionalInfrastructure";
import { getLatencyStats }                 from "../optimization/latencyOptimizer";

export type NetworkHealth = "healthy" | "degraded" | "critical";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export interface PlanetaryIncident {
  id:         string;
  title:      string;
  region:     string;
  severity:   IncidentSeverity;
  description: string;
  status:     "active" | "investigating" | "resolved";
  detectedAt: number;
  resolvedAt?: number;
}

export interface RegionSummary {
  regionId:   string;
  regionName: string;
  nodes:      number;
  online:     number;
  latency_ms: number;
  health:     "healthy" | "degraded" | "critical";
}

export interface PlanetaryHealth {
  snapshotId:    string;
  timestamp:     number;
  totalNodes:    number;
  onlineNodes:   number;
  activeRegions: number;
  totalRegions:  number;
  avgLatency_ms: number;
  globalTps:     number;
  networkHealth: NetworkHealth;
  healthScore:   number;
  incidents:     PlanetaryIncident[];
  byRegion:      RegionSummary[];
}

const snapshots: PlanetaryHealth[] = [];
const incidents: PlanetaryIncident[] = [];
const MAX_SNAPSHOTS = 200;

function rand(a: number, b: number)  { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pick<T>(arr: T[]): T       { return arr[Math.floor(Math.random() * arr.length)]!; }

const INCIDENT_TEMPLATES = [
  { title: "RPC Gateway Timeout",        template: "region",  severity: "medium"   as const, description: "Elevated timeout rate detected on RPC gateways" },
  { title: "Validator Sync Lag",         template: "region",  severity: "low"      as const, description: "Validators falling behind head by >3 blocks" },
  { title: "High Latency Detected",      template: "region",  severity: "medium"   as const, description: "Cross-region latency exceeds 300ms SLA" },
  { title: "Node Offline",               template: "region",  severity: "high"     as const, description: "Critical node went offline unexpectedly" },
  { title: "Memory Pressure",            template: "region",  severity: "low"      as const, description: "Archive node memory usage >90%" },
  { title: "Network Partition Risk",     template: "global",  severity: "critical" as const, description: "Cross-region connectivity degraded — partition risk" },
  { title: "Peer Count Degradation",     template: "region",  severity: "medium"   as const, description: "Peer count dropped below minimum threshold" },
];

function buildSnapshot(): PlanetaryHealth {
  const nodeStats   = getNodeStats();
  const regionStats = getRegionStats();
  const latStats    = getLatencyStats();
  const nodes       = getNodes({ limit: 999 });
  const onlineNodes = nodes.filter(n => n.status === "online");

  const healthScore = nodeStats.total > 0
    ? Math.round((nodeStats.online / nodeStats.total) * 100 * 0.6 + (100 - Math.min(100, latStats.avgLatency_ms / 3)) * 0.4)
    : 50;

  const networkHealth: NetworkHealth = healthScore >= 85 ? "healthy" : healthScore >= 60 ? "degraded" : "critical";

  const activeIncidents = incidents.filter(i => i.status !== "resolved");

  const byRegion: RegionSummary[] = REGIONS.slice(0, 12).map(region => {
    const regionNodes = nodes.filter(n => n.region.id === region.id);
    const regionOnline = regionNodes.filter(n => n.status === "online");
    const avgLat = regionOnline.length ? Math.round(regionOnline.reduce((s, n) => s + n.latency_ms, 0) / regionOnline.length) : 9999;
    const rScore = regionNodes.length ? (regionOnline.length / regionNodes.length) * 100 : 0;
    return {
      regionId:   region.id,
      regionName: region.name,
      nodes:      regionNodes.length,
      online:     regionOnline.length,
      latency_ms: avgLat,
      health:     rScore >= 80 ? "healthy" : rScore >= 50 ? "degraded" : "critical",
    };
  });

  return {
    snapshotId:    uuid(),
    timestamp:     Date.now(),
    totalNodes:    nodeStats.total,
    onlineNodes:   nodeStats.online,
    activeRegions: byRegion.filter(r => r.nodes > 0).length,
    totalRegions:  REGIONS.length,
    avgLatency_ms: latStats.avgLatency_ms,
    globalTps:     rand(5000, 30000),
    networkHealth,
    healthScore:   Math.max(0, Math.min(100, healthScore)),
    incidents:     activeIncidents,
    byRegion,
  };
}

function seedIncidents() {
  const count = rand(2, 5);
  for (let i = 0; i < count; i++) {
    const template = pick(INCIDENT_TEMPLATES);
    const region   = pick(REGIONS);
    const resolved = Math.random() > 0.4;
    const detected = Date.now() - rand(1, 48) * 3_600_000;
    incidents.push({
      id:          uuid(),
      title:       template.title,
      region:      template.template === "global" ? "global" : region.name,
      severity:    template.severity,
      description: template.description,
      status:      resolved ? "resolved" : pick(["active", "investigating"] as const),
      detectedAt:  detected,
      resolvedAt:  resolved ? detected + rand(300_000, 7_200_000) : undefined,
    });
  }
}

function seedSnapshots() {
  seedIncidents();
  // Generate 20 historical snapshots spread over last 24 hours
  for (let i = 20; i >= 0; i--) {
    const snap = buildSnapshot();
    snap.timestamp = Date.now() - i * 72 * 60 * 1000;  // every ~72 min
    snap.snapshotId = uuid();
    snapshots.push(snap);
  }
  logger.info(`[GlobalMonitor] Seeded ${snapshots.length} health snapshots, ${incidents.length} incidents`);
}

export function monitorPlanet(): PlanetaryHealth {
  const snap = buildSnapshot();
  snapshots.push(snap);
  if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();

  // Auto-detect new incidents
  if (snap.networkHealth === "critical" && !incidents.find(i => i.title === "Network Partition Risk" && i.status === "active")) {
    const inc: PlanetaryIncident = {
      id:          uuid(),
      title:       "Network Partition Risk",
      region:      "global",
      severity:    "critical",
      description: "Global health score critically low — partition risk detected",
      status:      "active",
      detectedAt:  Date.now(),
    };
    incidents.unshift(inc);
  }

  snap.byRegion.forEach(r => {
    if (r.health === "critical" && r.nodes > 0) {
      const existing = incidents.find(i => i.region === r.regionName && i.status === "active");
      if (!existing) {
        const inc: PlanetaryIncident = {
          id:          uuid(),
          title:       "Region Health Critical",
          region:      r.regionName,
          severity:    "high",
          description: `${r.regionName} has ${r.online}/${r.nodes} nodes online`,
          status:      "active",
          detectedAt:  Date.now(),
        };
        incidents.unshift(inc);
      }
    }
  });

  logger.info(`[GlobalMonitor] Snapshot: ${snap.onlineNodes}/${snap.totalNodes} nodes online, health=${snap.healthScore}%, network=${snap.networkHealth}`);
  return snap;
}

export function getHealthHistory(limit = 50): PlanetaryHealth[] {
  return snapshots.slice(-limit).reverse();
}

export function getLatestSnapshot(): PlanetaryHealth | null {
  return snapshots.length ? snapshots[snapshots.length - 1]! : null;
}

export function getIncidents(status?: PlanetaryIncident["status"], limit = 50): PlanetaryIncident[] {
  let list = [...incidents];
  if (status) list = list.filter(i => i.status === status);
  return list.slice(0, limit);
}

export function resolveIncident(id: string): PlanetaryIncident | null {
  const inc = incidents.find(i => i.id === id);
  if (!inc) return null;
  inc.status     = "resolved";
  inc.resolvedAt = Date.now();
  logger.info(`[GlobalMonitor] Resolved incident: ${inc.title} (${id})`);
  return inc;
}

export function getGlobalStats() {
  const latest = getLatestSnapshot();
  return {
    snapshotCount:    snapshots.length,
    latestHealth:     latest?.networkHealth ?? "unknown",
    latestScore:      latest?.healthScore ?? 0,
    totalNodes:       latest?.totalNodes ?? 0,
    onlineNodes:      latest?.onlineNodes ?? 0,
    activeRegions:    latest?.activeRegions ?? 0,
    avgLatency_ms:    latest?.avgLatency_ms ?? 0,
    openIncidents:    incidents.filter(i => i.status !== "resolved").length,
    totalIncidents:   incidents.length,
  };
}

seedSnapshots();
