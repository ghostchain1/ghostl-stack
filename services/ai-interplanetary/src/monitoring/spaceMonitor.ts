/**
 * Space Infrastructure Monitor
 * Tracks all space-based assets: satellites, orbital validators, comm links.
 * Generates incident reports and a global space-health snapshot.
 */
import { v4 as uuid } from "uuid";
import { logger } from "../utils/logger";
import { getRelays, getRelayStats, tickRelayTelemetry }           from "../satellites/satelliteRelay";
import { getValidators, getValidatorStats, tickValidatorTelemetry } from "../orbit/orbitalValidator";
import { getLinks, getCommsStats, tickCommLinks }                  from "../communication/deepSpaceComms";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus   = "active" | "investigating" | "resolved";
export type NetworkHealth    = "healthy" | "degraded" | "critical";

export interface SpaceIncident {
  id:          string;
  title:       string;
  assetId:     string;
  assetType:   "satellite" | "orbital-validator" | "comm-link";
  severity:    IncidentSeverity;
  description: string;
  status:      IncidentStatus;
  detectedAt:  number;
  resolvedAt?: number;
}

export interface SpaceHealthSnapshot {
  snapshotId:         string;
  timestamp:          number;
  totalSatellites:    number;
  activeSatellites:   number;
  totalValidators:    number;
  activeValidators:   number;
  totalCommLinks:     number;
  activeCommLinks:    number;
  avgSatLatency_ms:   number;
  avgValLatency_ms:   number;
  networkHealth:      NetworkHealth;
  healthScore:        number;   // 0-100
  incidents:          SpaceIncident[];
  relayedTxTotal:     number;
  blocksRelayedTotal: number;
}

// ── In-memory store ──────────────────────────────────────────────────────────
const incidents:    SpaceIncident[]       = [];
const snapshots:    SpaceHealthSnapshot[] = [];
const MAX_SNAPSHOTS = 200;

// Seed historical snapshots
(function seed() {
  const now = Date.now();
  for (let i = 24; i >= 0; i--) {
    const totalSat  = 12;
    const activeSat = 10 + Math.floor(Math.random() * 2);
    const totalVal  = 10;
    const activeVal =  8 + Math.floor(Math.random() * 2);
    const totalLink = 10;
    const activeLink =  8 + Math.floor(Math.random() * 2);
    const healthScore = Math.round(
      ((activeSat / totalSat) * 40 + (activeVal / totalVal) * 40 + (activeLink / totalLink) * 20)
    );
    snapshots.push({
      snapshotId:         uuid(),
      timestamp:          now - i * 3600_000,
      totalSatellites:    totalSat,
      activeSatellites:   activeSat,
      totalValidators:    totalVal,
      activeValidators:   activeVal,
      totalCommLinks:     totalLink,
      activeCommLinks:    activeLink,
      avgSatLatency_ms:   25 + Math.floor(Math.random() * 20),
      avgValLatency_ms:   200 + Math.floor(Math.random() * 100),
      networkHealth:      healthScore >= 80 ? "healthy" : healthScore >= 60 ? "degraded" : "critical",
      healthScore,
      incidents:          [],
      relayedTxTotal:     Math.floor(Math.random() * 5_000_000),
      blocksRelayedTotal: Math.floor(Math.random() * 200_000),
    });
  }

  // Seed a few incidents
  const seedIncidents: SpaceIncident[] = [
    {
      id: uuid(), title: "GhostSat-3 signal degradation", assetId: "seed-1",
      assetType: "satellite", severity: "medium",
      description: "Carrier signal strength dropped 15dB due to solar weather",
      status: "resolved", detectedAt: now - 4 * 3600_000, resolvedAt: now - 2 * 3600_000,
    },
    {
      id: uuid(), title: "LunarGate-Val-1 sync lag", assetId: "seed-2",
      assetType: "orbital-validator", severity: "low",
      description: "Block sync lagging 120 blocks — high latency comm window",
      status: "investigating", detectedAt: now - 30 * 60_000,
    },
  ];
  incidents.push(...seedIncidents);
  logger.info(`[spaceMonitor] seeded ${snapshots.length} snapshots, ${incidents.length} incidents`);
})();

// ── Public API ────────────────────────────────────────────────────────────────

export async function monitorSpaceNodes(): Promise<SpaceHealthSnapshot> {
  // Tick all telemetry
  tickRelayTelemetry();
  tickValidatorTelemetry();
  tickCommLinks();

  const rStats = getRelayStats();
  const vStats = getValidatorStats();
  const cStats = getCommsStats();

  const healthScore = Math.max(0, Math.min(100, Math.round(
    (rStats.active / Math.max(rStats.total, 1)) * 40 +
    (vStats.active / Math.max(vStats.total, 1)) * 40 +
    (cStats.active / Math.max(cStats.total, 1)) * 20
  )));

  const networkHealth: NetworkHealth =
    healthScore >= 80 ? "healthy" :
    healthScore >= 55 ? "degraded" : "critical";

  // Auto-create incidents for critical conditions
  const relays = getRelays();
  for (const r of relays) {
    if (r.status === "degraded" && !incidents.some(i => i.assetId === r.id && i.status !== "resolved")) {
      incidents.push({
        id: uuid(), title: `${r.name} degradation`,
        assetId: r.id, assetType: "satellite", severity: "medium",
        description: `Satellite ${r.name} (${r.orbit}) reporting degraded signal`,
        status: "active", detectedAt: Date.now(),
      });
    }
  }

  const snapshot: SpaceHealthSnapshot = {
    snapshotId:         uuid(),
    timestamp:          Date.now(),
    totalSatellites:    rStats.total,
    activeSatellites:   rStats.active,
    totalValidators:    vStats.total,
    activeValidators:   vStats.active,
    totalCommLinks:     cStats.total,
    activeCommLinks:    cStats.active,
    avgSatLatency_ms:   rStats.avgLatency_ms,
    avgValLatency_ms:   vStats.avgLatency_ms,
    networkHealth,
    healthScore,
    incidents:          incidents.filter(i => i.status !== "resolved"),
    relayedTxTotal:     rStats.totalTxRelayed,
    blocksRelayedTotal: rStats.totalBlocksRelayed,
  };

  if (snapshots.length >= MAX_SNAPSHOTS) snapshots.shift();
  snapshots.push(snapshot);

  logger.info(`[spaceMonitor] snapshot: health=${networkHealth} score=${healthScore} sats=${rStats.active}/${rStats.total} vals=${vStats.active}/${vStats.total}`);
  return snapshot;
}

export function getHealthHistory(limit = 48): SpaceHealthSnapshot[] {
  return snapshots.slice(-limit).reverse();
}

export function getLatestSnapshot(): SpaceHealthSnapshot | null {
  return snapshots[snapshots.length - 1] ?? null;
}

export function getIncidents(status?: IncidentStatus, limit = 50): SpaceIncident[] {
  return incidents
    .filter(i => !status || i.status === status)
    .slice(-limit)
    .reverse();
}

export async function resolveIncident(id: string): Promise<SpaceIncident> {
  const inc = incidents.find(i => i.id === id);
  if (!inc) throw new Error(`Incident ${id} not found`);
  inc.status     = "resolved";
  inc.resolvedAt = Date.now();
  logger.info(`[spaceMonitor] incident resolved: ${inc.title}`);
  return inc;
}

export function getGlobalSpaceStats() {
  const rStats = getRelayStats();
  const vStats = getValidatorStats();
  const cStats = getCommsStats();
  const latest = getLatestSnapshot();

  return {
    satellites:   rStats,
    validators:   vStats,
    comms:        cStats,
    healthScore:  latest?.healthScore ?? 0,
    networkHealth: latest?.networkHealth ?? "degraded",
    activeIncidents: incidents.filter(i => i.status !== "resolved").length,
  };
}
