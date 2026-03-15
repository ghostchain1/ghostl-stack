/**
 * Deep-Space Communications
 * Manages long-distance interplanetary synchronisation links between Earth nodes,
 * satellite relays, orbital validators, and hypothetical deep-space relay stations.
 */
import { v4 as uuid } from "uuid";
import { logger } from "../utils/logger";

export type CommLinkStatus   = "active" | "degraded" | "blackout" | "establishing";
export type CommProtocol     = "DTN"  | "QUIC" | "TCPIP-Relay" | "Laser-Optical" | "Radio-X";
export type SyncStatus       = "synchronized" | "syncing" | "lagging" | "stalled";
export type NodeCategory     = "ground-control" | "satellite" | "orbital" | "deep-space";

export interface CommLink {
  id:            string;
  name:          string;
  fromNode:      string;
  toNode:        string;
  fromCategory:  NodeCategory;
  toCategory:    NodeCategory;
  protocol:      CommProtocol;
  status:        CommLinkStatus;
  distanceKm:    number;
  latency_ms:    number;
  bandwidth_kbps: number;
  signalStrength: number;   // 0-100 dBm scale
  checksumOk:    boolean;
  packetLoss:    number;    // 0-1
  bytesExchanged: number;
  establishedAt: number;
  lastSync:      number;
}

export interface SyncSession {
  id:            string;
  linkId:        string;
  network:       "GhostChain" | "GhostL2" | "GhostL3";
  status:        SyncStatus;
  blocksToSync:  number;
  blocksSynced:  number;
  startedAt:     number;
  completedAt?:  number;
  bytesExchanged: number;
}

export interface BlackoutEvent {
  id:          string;
  linkId:      string;
  cause:       "solar-interference" | "orbital-geometry" | "hardware-fault" | "signal-loss" | "planned-maintenance";
  durationMs:  number;
  occurredAt:  number;
  resolvedAt?: number;
}

// ── Protocol characteristics ─────────────────────────────────────────────────
const PROTO_PARAMS: Record<CommProtocol, { bandwidthKbps: number; reliability: number }> = {
  "DTN":          { bandwidthKbps: 512,    reliability: 0.97 },
  "QUIC":         { bandwidthKbps: 50000,  reliability: 0.99 },
  "TCPIP-Relay":  { bandwidthKbps: 10000,  reliability: 0.95 },
  "Laser-Optical":{ bandwidthKbps: 100000, reliability: 0.98 },
  "Radio-X":      { bandwidthKbps: 128,    reliability: 0.90 },
};

// ── In-memory store ──────────────────────────────────────────────────────────
const links:   CommLink[]     = [];
const sessions: SyncSession[] = [];
const blackouts: BlackoutEvent[] = [];

const LINK_SEEDS: {
  from: string; to: string; fromCat: NodeCategory; toCat: NodeCategory;
  protocol: CommProtocol; distKm: number; latency: number;
}[] = [
  { from: "Earth-Control-Prime",  to: "GhostSat-1",       fromCat: "ground-control", toCat: "satellite",  protocol: "QUIC",          distKm: 600,     latency: 22   },
  { from: "Earth-Control-Prime",  to: "GhostSat-2",       fromCat: "ground-control", toCat: "satellite",  protocol: "QUIC",          distKm: 600,     latency: 22   },
  { from: "GhostSat-1",           to: "GhostOrbit-Val-1", fromCat: "satellite",      toCat: "orbital",    protocol: "Laser-Optical", distKm: 1200,    latency: 28   },
  { from: "GhostSat-2",           to: "GhostOrbit-Val-2", fromCat: "satellite",      toCat: "orbital",    protocol: "QUIC",          distKm: 1200,    latency: 30   },
  { from: "GhostOrbit-Val-1",     to: "LunarGate-Val-1",  fromCat: "orbital",        toCat: "deep-space", protocol: "DTN",           distKm: 384400,  latency: 1300 },
  { from: "GhostOrbit-Val-2",     to: "DeepSpace-Val-1",  fromCat: "orbital",        toCat: "deep-space", protocol: "Radio-X",       distKm: 2000000, latency: 6000 },
  { from: "Earth-Control-Backup", to: "NovaSat-Alpha",    fromCat: "ground-control", toCat: "satellite",  protocol: "TCPIP-Relay",   distKm: 600,     latency: 25   },
  { from: "NovaSat-Alpha",        to: "GhostOrbit-GEO-1", fromCat: "satellite",      toCat: "orbital",    protocol: "DTN",           distKm: 35786,   latency: 620  },
  { from: "Earth-Control-Prime",  to: "Starshield-1",     fromCat: "ground-control", toCat: "satellite",  protocol: "Laser-Optical", distKm: 480,     latency: 18   },
  { from: "Starshield-1",         to: "GhostOrbit-Val-4", fromCat: "satellite",      toCat: "orbital",    protocol: "QUIC",          distKm: 12000,   latency: 90   },
];

(function seed() {
  const now = Date.now();
  for (const s of LINK_SEEDS) {
    const pp = PROTO_PARAMS[s.protocol];
    links.push({
      id:             uuid(),
      name:           `${s.from} ↔ ${s.to}`,
      fromNode:       s.from,
      toNode:         s.to,
      fromCategory:   s.fromCat,
      toCategory:     s.toCat,
      protocol:       s.protocol,
      status:         Math.random() < 0.88 ? "active" : "degraded",
      distanceKm:     s.distKm,
      latency_ms:     s.latency,
      bandwidth_kbps: pp.bandwidthKbps,
      signalStrength: 60 + Math.floor(Math.random() * 40),
      checksumOk:     true,
      packetLoss:     Math.random() * (1 - pp.reliability),
      bytesExchanged: Math.floor(Math.random() * 10_000_000_000),
      establishedAt:  now - Math.floor(Math.random() * 90 * 24 * 3600 * 1000),
      lastSync:       now - Math.floor(Math.random() * 120_000),
    });
  }
  logger.info(`[deepSpaceComms] seeded ${links.length} comm links`);
})();

// ── Public API ────────────────────────────────────────────────────────────────

export async function syncPlanetaryNodes(
  network: "GhostChain" | "GhostL2" | "GhostL3" = "GhostChain"
): Promise<SyncSession[]> {
  const activeLinks = links.filter(l => l.status === "active");
  const newSessions: SyncSession[] = [];

  for (const link of activeLinks.slice(0, 4)) {
    const blocksToSync = Math.floor(Math.random() * 200);
    const session: SyncSession = {
      id:             uuid(),
      linkId:         link.id,
      network,
      status:         "syncing",
      blocksToSync,
      blocksSynced:   0,
      startedAt:      Date.now(),
      bytesExchanged: 0,
    };
    sessions.push(session);
    newSessions.push(session);

    // Simulate sync completion
    const syncMs = Math.floor(link.latency_ms * 2 + Math.random() * 3000);
    setTimeout(() => {
      session.status        = "synchronized";
      session.blocksSynced  = blocksToSync;
      session.bytesExchanged = blocksToSync * 1024 + Math.floor(Math.random() * 50_000);
      session.completedAt   = Date.now();
      link.lastSync         = Date.now();
      link.bytesExchanged  += session.bytesExchanged;
      logger.info(`[deepSpaceComms] sync on link ${link.name} complete (${blocksToSync} blocks)`);
    }, syncMs);
  }

  logger.info(`[deepSpaceComms] initiated ${newSessions.length} sync sessions for ${network}`);
  return newSessions;
}

export function getLinks(opts: { fromCategory?: NodeCategory; toCategory?: NodeCategory; status?: CommLinkStatus } = {}): CommLink[] {
  return links.filter(l =>
    (!opts.fromCategory || l.fromCategory === opts.fromCategory) &&
    (!opts.toCategory   || l.toCategory   === opts.toCategory  ) &&
    (!opts.status       || l.status       === opts.status       )
  );
}

export function getSyncSessions(limit = 30): SyncSession[] {
  return sessions.slice(-limit).reverse();
}

export function getCommsStats() {
  const total    = links.length;
  const active   = links.filter(l => l.status === "active").length;
  const blackout = links.filter(l => l.status === "blackout").length;
  const byProto: Record<string, number>    = {};
  const byCategory: Record<string, number> = {};
  let   sumLatency = 0;
  let   totalBytes = 0;

  for (const l of links) {
    byProto[l.protocol]          = (byProto[l.protocol]          ?? 0) + 1;
    byCategory[l.fromCategory]   = (byCategory[l.fromCategory]   ?? 0) + 1;
    sumLatency += l.latency_ms;
    totalBytes += l.bytesExchanged;
  }

  return {
    total, active, blackout, degraded: total - active - blackout,
    byProto, byCategory,
    avgLatency_ms:     total ? Math.round(sumLatency / total) : 0,
    totalBytesRouted:  totalBytes,
    activeSessions:    sessions.filter(s => s.status === "syncing").length,
    totalBlackouts:    blackouts.length,
  };
}

export function getBlackouts(): BlackoutEvent[] { return [...blackouts].reverse(); }

// Internal tick: simulate link events
export function tickCommLinks(): void {
  const now = Date.now();
  for (const l of links) {
    if (l.status === "active") {
      l.bytesExchanged += Math.floor(Math.random() * 50_000);
      l.lastSync        = now;
      if (Math.random() < 0.008) {
        const causes: BlackoutEvent["cause"][] = ["solar-interference", "orbital-geometry", "signal-loss"];
        const cause = causes[Math.floor(Math.random() * causes.length)];
        l.status = "blackout";
        const ev: BlackoutEvent = {
          id: uuid(), linkId: l.id, cause,
          durationMs: 0, occurredAt: now,
        };
        blackouts.push(ev);
        const recoverMs = 15000 + Math.floor(Math.random() * 30000);
        setTimeout(() => {
          l.status     = "active";
          ev.durationMs = Date.now() - ev.occurredAt;
          ev.resolvedAt = Date.now();
          logger.info(`[deepSpaceComms] link ${l.name} recovered from ${cause}`);
        }, recoverMs);
        logger.warn(`[deepSpaceComms] ${l.name} blackout — cause: ${cause}`);
      }
    } else if (l.status === "degraded" && Math.random() < 0.2) {
      l.status = "active";
    }
  }
}
