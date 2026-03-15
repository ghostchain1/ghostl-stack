/**
 * Satellite Relay Nodes
 * Deploys and manages satellite relays that bridge remote terrestrial regions
 * to the GhostChain/GhostL2/GhostL3 networks.
 */
import { v4 as uuid } from "uuid";
import { logger } from "../utils/logger";

export type SatelliteStatus   = "active" | "degraded" | "offline" | "launching" | "deorbiting";
export type OrbitType         = "LEO" | "MEO" | "GEO" | "HEO";
export type ConstellationName = "Starshield" | "Kuiper" | "Teledesic" | "GhostSat" | "NovaSat" | "OrbitNet";
export type SatelliteRole     = "relay" | "validator-relay" | "archive-relay" | "boot-relay" | "deep-space-relay";
export type NetworkName       = "GhostChain" | "GhostL2" | "GhostL3";

export interface GroundStation {
  id:        string;
  name:      string;
  location:  string;        // city / region
  lat:       number;
  lon:       number;
  connected: boolean;
}

export interface SatelliteRelay {
  id:              string;
  name:            string;
  constellation:   ConstellationName;
  orbit:           OrbitType;
  role:            SatelliteRole;
  network:         NetworkName;
  status:          SatelliteStatus;
  altitudeKm:      number;
  inclinationDeg:  number;
  latency_ms:      number;         // round-trip to nearest ground station
  throughputMbps:  number;
  uptime:          number;         // 0-100
  groundStations:  GroundStation[];
  relayedTx:       number;
  blocksRelayed:   number;
  peersConnected:  number;
  launchedAt:      number;
  lastContact:     number;
}

export interface RelayAction {
  id:          string;
  satelliteId: string;
  action:      "reroute" | "boost-power" | "repoint-antenna" | "failover" | "relaunch";
  reason:      string;
  status:      "pending" | "executing" | "complete" | "failed";
  triggeredAt: number;
  completedAt?: number;
}

// ── Constellation presets ──────────────────────────────────────────────────
const CONSTELLATION_PARAMS: Record<ConstellationName, { orbit: OrbitType; altKm: number; incl: number; latency: number; throughput: number }> = {
  GhostSat:   { orbit: "LEO", altKm: 550,   incl: 53,  latency: 20,  throughput: 800  },
  NovaSat:    { orbit: "LEO", altKm: 600,   incl: 70,  latency: 22,  throughput: 600  },
  Starshield: { orbit: "LEO", altKm: 480,   incl: 97,  latency: 18,  throughput: 1000 },
  Kuiper:     { orbit: "MEO", altKm: 2000,  incl: 51,  latency: 35,  throughput: 400  },
  OrbitNet:   { orbit: "MEO", altKm: 8000,  incl: 55,  latency: 80,  throughput: 250  },
  Teledesic:  { orbit: "GEO", altKm: 35786, incl: 0,   latency: 600, throughput: 100  },
};

const GROUND_STATION_POOL: GroundStation[] = [
  { id: "gs-1",  name: "Alaska GS",     location: "Fairbanks, AK",     lat: 64.8,  lon: -147.7, connected: true  },
  { id: "gs-2",  name: "Hawaii GS",     location: "Maui, HI",          lat: 20.8,  lon: -156.3, connected: true  },
  { id: "gs-3",  name: "UK GS",         location: "Goonhilly, UK",     lat: 50.0,  lon: -5.2,   connected: true  },
  { id: "gs-4",  name: "Norway GS",     location: "Svalbard, NO",      lat: 78.2,  lon: 15.5,   connected: true  },
  { id: "gs-5",  name: "Singapore GS",  location: "Singapore, SG",     lat: 1.3,   lon: 103.8,  connected: true  },
  { id: "gs-6",  name: "Australia GS",  location: "Alice Springs, AU", lat: -23.7, lon: 133.9,  connected: true  },
  { id: "gs-7",  name: "Chile GS",      location: "Atacama, CL",       lat: -24.0, lon: -70.0,  connected: true  },
  { id: "gs-8",  name: "South Africa GS", location: "Hartebeesthoek, ZA", lat: -25.9, lon: 27.7, connected: true },
  { id: "gs-9",  name: "Arizona GS",    location: "Tucson, AZ",        lat: 32.2,  lon: -110.9, connected: true  },
  { id: "gs-10", name: "Japan GS",      location: "Okinawa, JP",       lat: 26.3,  lon: 127.8,  connected: true  },
];

const ROLE_ASSIGN: SatelliteRole[] = [
  "relay", "relay", "relay", "validator-relay", "archive-relay", "boot-relay", "deep-space-relay",
];

function pickFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickGS(count: number): GroundStation[] {
  const shuffled = [...GROUND_STATION_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ── In-memory store ─────────────────────────────────────────────────────────
const relays: SatelliteRelay[] = [];
const actions: RelayAction[]   = [];

// Seed initial constellation
(function seed() {
  const seeds: { name: string; constellation: ConstellationName; network: NetworkName }[] = [
    { name: "GhostSat-1",    constellation: "GhostSat",   network: "GhostChain" },
    { name: "GhostSat-2",    constellation: "GhostSat",   network: "GhostChain" },
    { name: "GhostSat-3",    constellation: "GhostSat",   network: "GhostL2"    },
    { name: "GhostSat-4",    constellation: "GhostSat",   network: "GhostL3"    },
    { name: "NovaSat-Alpha",  constellation: "NovaSat",    network: "GhostChain" },
    { name: "NovaSat-Beta",   constellation: "NovaSat",    network: "GhostL2"    },
    { name: "Starshield-1",  constellation: "Starshield", network: "GhostChain" },
    { name: "Starshield-2",  constellation: "Starshield", network: "GhostL2"    },
    { name: "Kuiper-Ghost-1", constellation: "Kuiper",     network: "GhostChain" },
    { name: "Kuiper-Ghost-2", constellation: "Kuiper",     network: "GhostL3"    },
    { name: "OrbitNet-1",    constellation: "OrbitNet",   network: "GhostChain" },
    { name: "Teledesic-1",   constellation: "Teledesic",  network: "GhostChain" },
  ];

  const now = Date.now();
  for (const s of seeds) {
    const p = CONSTELLATION_PARAMS[s.constellation];
    relays.push({
      id:             uuid(),
      name:           s.name,
      constellation:  s.constellation,
      orbit:          p.orbit,
      role:           pickFrom(ROLE_ASSIGN),
      network:        s.network,
      status:         Math.random() < 0.85 ? "active" : "degraded",
      altitudeKm:     p.altKm,
      inclinationDeg: p.incl,
      latency_ms:     p.latency + Math.floor(Math.random() * 10),
      throughputMbps: p.throughput * (0.7 + Math.random() * 0.3),
      uptime:         80 + Math.floor(Math.random() * 20),
      groundStations: pickGS(2 + Math.floor(Math.random() * 3)),
      relayedTx:      Math.floor(Math.random() * 500_000),
      blocksRelayed:  Math.floor(Math.random() * 10_000),
      peersConnected: 2 + Math.floor(Math.random() * 8),
      launchedAt:     now - Math.floor(Math.random() * 180 * 24 * 3600 * 1000),
      lastContact:    now - Math.floor(Math.random() * 60_000),
    });
  }
  logger.info(`[satelliteRelay] seeded ${relays.length} satellite relays`);
})();

// ── Public API ───────────────────────────────────────────────────────────────

export async function deploySatelliteRelay(
  name:          string,
  constellation: ConstellationName = "GhostSat",
  network:       NetworkName       = "GhostChain",
  role:          SatelliteRole     = "relay"
): Promise<SatelliteRelay> {
  const p = CONSTELLATION_PARAMS[constellation];
  const relay: SatelliteRelay = {
    id:             uuid(),
    name,
    constellation,
    orbit:          p.orbit,
    role,
    network,
    status:         "launching",
    altitudeKm:     p.altKm,
    inclinationDeg: p.incl,
    latency_ms:     p.latency,
    throughputMbps: p.throughput,
    uptime:         100,
    groundStations: pickGS(2),
    relayedTx:      0,
    blocksRelayed:  0,
    peersConnected: 0,
    launchedAt:     Date.now(),
    lastContact:    Date.now(),
  };
  relays.push(relay);
  // Simulate launch completion
  setTimeout(() => {
    relay.status        = "active";
    relay.peersConnected = 4;
    logger.info(`[satelliteRelay] ${name} reached orbit and is now active`);
  }, 3000);
  logger.info(`[satelliteRelay] launching ${name} (${constellation} / ${p.orbit})`);
  return relay;
}

export function getRelays(opts: { network?: NetworkName; status?: SatelliteStatus; constellation?: ConstellationName } = {}): SatelliteRelay[] {
  return relays.filter(r =>
    (!opts.network       || r.network === opts.network) &&
    (!opts.status        || r.status  === opts.status ) &&
    (!opts.constellation || r.constellation === opts.constellation)
  );
}

export function getRelayStats() {
  const total       = relays.length;
  const active      = relays.filter(r => r.status === "active").length;
  const degraded    = relays.filter(r => r.status === "degraded").length;
  const byOrbit     = { LEO: 0, MEO: 0, GEO: 0, HEO: 0 };
  const byNetwork   = { GhostChain: 0, GhostL2: 0, GhostL3: 0 };
  const byRole: Record<string, number> = {};
  let   totalTx     = 0;
  let   totalBlocks = 0;
  let   sumLatency  = 0;

  for (const r of relays) {
    byOrbit[r.orbit]++;
    byNetwork[r.network]++;
    byRole[r.role] = (byRole[r.role] ?? 0) + 1;
    totalTx     += r.relayedTx;
    totalBlocks += r.blocksRelayed;
    sumLatency  += r.latency_ms;
  }

  return {
    total, active, degraded, offline: total - active - degraded,
    byOrbit, byNetwork, byRole,
    totalTxRelayed:     totalTx,
    totalBlocksRelayed: totalBlocks,
    avgLatency_ms:      total ? Math.round(sumLatency / total) : 0,
    actionsPending:     actions.filter(a => a.status === "pending").length,
  };
}

export async function triggerRelayAction(satelliteId: string, action: RelayAction["action"], reason: string): Promise<RelayAction> {
  const relay = relays.find(r => r.id === satelliteId);
  if (!relay) throw new Error(`Satellite ${satelliteId} not found`);
  const act: RelayAction = {
    id: uuid(), satelliteId, action, reason,
    status: "pending", triggeredAt: Date.now(),
  };
  actions.push(act);
  setTimeout(() => {
    act.status      = "complete";
    act.completedAt = Date.now();
    if (action === "boost-power" || action === "reroute") relay.status = "active";
    logger.info(`[satelliteRelay] action ${action} on ${relay.name} complete`);
  }, 2000);
  return act;
}

export function getRelayActions(): RelayAction[] { return [...actions].reverse(); }

// Internal heartbeat: update telemetry
export function tickRelayTelemetry(): void {
  const now = Date.now();
  for (const r of relays) {
    if (r.status === "active") {
      r.relayedTx     += Math.floor(Math.random() * 500);
      r.blocksRelayed += Math.floor(Math.random() * 5);
      r.lastContact    = now;
      // Random degradation
      if (Math.random() < 0.02) {
        r.status = "degraded";
        logger.warn(`[satelliteRelay] ${r.name} degraded – scheduling recovery`);
        triggerRelayAction(r.id, "reroute", "Auto-recovery: signal degraded").catch(() => undefined);
      }
    } else if (r.status === "degraded" && Math.random() < 0.3) {
      r.status      = "active";
      r.lastContact = now;
    }
  }
}
