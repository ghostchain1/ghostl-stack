/**
 * Orbital Validator Nodes
 * Space-based blockchain validators hosted in orbital data centres.
 * Benefits: censorship resistance, geopolitical neutrality, ultra-high resilience.
 */
import { v4 as uuid } from "uuid";
import { logger } from "../utils/logger";

export type OrbitalStatus   = "active" | "syncing" | "degraded" | "offline" | "launching";
export type OrbitalOrbit    = "LEO" | "MEO" | "GEO" | "Lunar-Gateway" | "Deep-Space";
export type NetworkName     = "GhostChain" | "GhostL2" | "GhostL3";
export type ValidatorRole   = "validator" | "proposer" | "archive" | "sequencer" | "light";

export interface OrbitalValidator {
  id:               string;
  name:             string;
  orbitType:        OrbitalOrbit;
  network:          NetworkName;
  role:             ValidatorRole;
  status:           OrbitalStatus;
  altitudeKm:       number;
  latency_ms:       number;       // avg comms latency to ground
  powerWatts:       number;
  cpuCores:         number;
  memoryGB:         number;
  storageGB:        number;
  blockHeight:      number;
  missedSlots:      number;
  totalSlots:       number;
  uptime:           number;       // 0-100
  geopoliticalZone: "neutral-space" | "LEO-belt" | "lunar-orbit" | "deep-space";
  censorshipRisk:   "none" | "low" | "medium";
  deployedAt:       number;
  lastHeartbeat:    number;
}

export interface ValidatorUpgrade {
  id:            string;
  validatorId:   string;
  upgradeType:   "firmware" | "software" | "antenna" | "battery" | "solar-panel";
  reason:        string;
  status:        "scheduled" | "in-progress" | "complete" | "failed";
  scheduledAt:   number;
  completedAt?:  number;
}

// ── Orbit configurations ─────────────────────────────────────────────────────
const ORBIT_PARAMS: Record<OrbitalOrbit, { altKm: number; latency: number; power: number; geoZone: OrbitalValidator["geopoliticalZone"] }> = {
  "LEO":           { altKm: 600,     latency: 25,   power: 200,  geoZone: "LEO-belt"       },
  "MEO":           { altKm: 12000,   latency: 90,   power: 350,  geoZone: "neutral-space"  },
  "GEO":           { altKm: 35786,   latency: 620,  power: 500,  geoZone: "neutral-space"  },
  "Lunar-Gateway": { altKm: 384400,  latency: 1300, power: 800,  geoZone: "lunar-orbit"    },
  "Deep-Space":    { altKm: 2000000, latency: 6000, power: 1200, geoZone: "deep-space"     },
};

const ROLE_LIST: ValidatorRole[] = ["validator", "validator", "proposer", "archive", "sequencer", "light"];

function pickFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── In-memory store ──────────────────────────────────────────────────────────
const validators: OrbitalValidator[] = [];
const upgrades:   ValidatorUpgrade[] = [];

(function seed() {
  const seeds: { name: string; orbit: OrbitalOrbit; network: NetworkName }[] = [
    { name: "GhostOrbit-Val-1",  orbit: "LEO",           network: "GhostChain" },
    { name: "GhostOrbit-Val-2",  orbit: "LEO",           network: "GhostChain" },
    { name: "GhostOrbit-Val-3",  orbit: "LEO",           network: "GhostL2"    },
    { name: "GhostOrbit-Val-4",  orbit: "MEO",           network: "GhostChain" },
    { name: "GhostOrbit-Val-5",  orbit: "MEO",           network: "GhostL2"    },
    { name: "GhostOrbit-Val-6",  orbit: "MEO",           network: "GhostL3"    },
    { name: "GhostOrbit-GEO-1",  orbit: "GEO",           network: "GhostChain" },
    { name: "GhostOrbit-GEO-2",  orbit: "GEO",           network: "GhostL2"    },
    { name: "LunarGate-Val-1",   orbit: "Lunar-Gateway", network: "GhostChain" },
    { name: "DeepSpace-Val-1",   orbit: "Deep-Space",    network: "GhostChain" },
  ];

  const now = Date.now();
  for (const s of seeds) {
    const p = ORBIT_PARAMS[s.orbit];
    const totalSlots = 5000 + Math.floor(Math.random() * 50_000);
    validators.push({
      id:               uuid(),
      name:             s.name,
      orbitType:        s.orbit,
      network:          s.network,
      role:             pickFrom(ROLE_LIST),
      status:           Math.random() < 0.85 ? "active" : "syncing",
      altitudeKm:       p.altKm,
      latency_ms:       p.latency + Math.floor(Math.random() * 20),
      powerWatts:       p.power,
      cpuCores:         8 + Math.floor(Math.random() * 24),
      memoryGB:         16 + Math.floor(Math.random() * 48),
      storageGB:        500 + Math.floor(Math.random() * 3500),
      blockHeight:      Math.floor(Math.random() * 5_000_000),
      missedSlots:      Math.floor(Math.random() * 50),
      totalSlots,
      uptime:           90 + Math.floor(Math.random() * 10),
      geopoliticalZone: p.geoZone,
      censorshipRisk:   s.orbit === "LEO" ? "low" : "none",
      deployedAt:       now - Math.floor(Math.random() * 365 * 24 * 3600 * 1000),
      lastHeartbeat:    now - Math.floor(Math.random() * 30_000),
    });
  }
  logger.info(`[orbitalValidator] seeded ${validators.length} orbital validators`);
})();

// ── Public API ────────────────────────────────────────────────────────────────

export async function deployOrbitalValidator(
  name:    string,
  orbit:   OrbitalOrbit  = "LEO",
  network: NetworkName   = "GhostChain",
  role:    ValidatorRole = "validator"
): Promise<OrbitalValidator> {
  const p = ORBIT_PARAMS[orbit];
  const v: OrbitalValidator = {
    id:               uuid(),
    name,
    orbitType:        orbit,
    network,
    role,
    status:           "launching",
    altitudeKm:       p.altKm,
    latency_ms:       p.latency,
    powerWatts:       p.power,
    cpuCores:         16,
    memoryGB:         32,
    storageGB:        2000,
    blockHeight:      0,
    missedSlots:      0,
    totalSlots:       0,
    uptime:           100,
    geopoliticalZone: p.geoZone,
    censorshipRisk:   orbit === "LEO" ? "low" : "none",
    deployedAt:       Date.now(),
    lastHeartbeat:    Date.now(),
  };
  validators.push(v);
  setTimeout(() => {
    v.status = "syncing";
    setTimeout(() => { v.status = "active"; }, 4000);
    logger.info(`[orbitalValidator] ${name} reached ${orbit} — syncing chain`);
  }, 3000);
  logger.info(`[orbitalValidator] launching ${name} to ${orbit}`);
  return v;
}

export function getValidators(opts: { network?: NetworkName; status?: OrbitalStatus; orbit?: OrbitalOrbit } = {}): OrbitalValidator[] {
  return validators.filter(v =>
    (!opts.network || v.network   === opts.network) &&
    (!opts.status  || v.status    === opts.status ) &&
    (!opts.orbit   || v.orbitType === opts.orbit  )
  );
}

export function getValidatorStats() {
  const total    = validators.length;
  const active   = validators.filter(v => v.status === "active").length;
  const syncing  = validators.filter(v => v.status === "syncing").length;
  const byOrbit: Record<string, number>   = {};
  const byNetwork: Record<string, number> = { GhostChain: 0, GhostL2: 0, GhostL3: 0 };
  let   sumLatency = 0;

  for (const v of validators) {
    byOrbit[v.orbitType] = (byOrbit[v.orbitType] ?? 0) + 1;
    byNetwork[v.network]++;
    sumLatency += v.latency_ms;
  }

  const censorshipFreePercent = Math.round(
    (validators.filter(v => v.censorshipRisk === "none").length / Math.max(total, 1)) * 100
  );

  return {
    total, active, syncing, offline: total - active - syncing,
    byOrbit, byNetwork, censorshipFreePercent,
    avgLatency_ms:    total ? Math.round(sumLatency / total) : 0,
    upgradesPending:  upgrades.filter(u => u.status === "scheduled").length,
  };
}

export async function scheduleUpgrade(
  validatorId: string,
  upgradeType: ValidatorUpgrade["upgradeType"],
  reason:      string
): Promise<ValidatorUpgrade> {
  const v = validators.find(x => x.id === validatorId);
  if (!v) throw new Error(`Validator ${validatorId} not found`);
  const upg: ValidatorUpgrade = {
    id: uuid(), validatorId, upgradeType, reason,
    status: "scheduled", scheduledAt: Date.now(),
  };
  upgrades.push(upg);
  setTimeout(() => {
    upg.status      = "in-progress";
    setTimeout(() => {
      upg.status      = "complete";
      upg.completedAt = Date.now();
      v.uptime        = Math.min(100, v.uptime + 2);
      logger.info(`[orbitalValidator] ${upgradeType} upgrade on ${v.name} complete`);
    }, 5000);
  }, 1000);
  return upg;
}

export function getUpgrades(): ValidatorUpgrade[] { return [...upgrades].reverse(); }

// Internal heartbeat
export function tickValidatorTelemetry(): void {
  const now = Date.now();
  for (const v of validators) {
    if (v.status === "active") {
      v.blockHeight  += Math.floor(Math.random() * 3);
      v.totalSlots   += 1;
      v.lastHeartbeat = now;
      if (Math.random() < 0.01) {
        v.missedSlots++;
        v.status = "degraded";
        scheduleUpgrade(v.id, "software", "Auto-recovery: missed slot detected").catch(() => undefined);
      }
    } else if (v.status === "degraded" && Math.random() < 0.4) {
      v.status       = "active";
      v.lastHeartbeat = now;
    }
  }
}
