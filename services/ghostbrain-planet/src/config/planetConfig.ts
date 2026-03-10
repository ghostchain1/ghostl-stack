// Planet-Scale Architecture — canonical configuration

import type { RegionDef } from '../types.js';

export const PLANET_PORT = Number(process.env['PLANET_PORT'] ?? 7926);
export const CYCLE_INTERVAL_MS = Number(process.env['PLANET_CYCLE_MS'] ?? 60_000);
export const DRY_RUN = process.env['PLANET_DRY_RUN'] === '1';
export const SIGNING_RELAY_URL =
  process.env['SIGNING_RELAY_URL'] ?? 'http://localhost:7910';
export const API_BASE =
  process.env['GHOSTSTACK_API_BASE'] ?? 'http://localhost:3000';

// Routing law: L3 → L2 → L1 (never skip layers)
export const CHAIN = {
  L1: 14000101,
  L2: 901,
  L3: 903,
} as const satisfies Record<string, number>;

// Planet-scale regions — each maps to a cluster of GhostChain validators
export const REGIONS: RegionDef[] = [
  { id: 'us-east',    name: 'US East (Virginia)',       validatorCount: 5,  priority: 1, lat: 38.9, lon: -77.0 },
  { id: 'us-west',    name: 'US West (Oregon)',         validatorCount: 4,  priority: 2, lat: 45.5, lon: -122.7 },
  { id: 'eu-west',    name: 'EU West (Ireland)',        validatorCount: 5,  priority: 1, lat: 53.3, lon: -6.2 },
  { id: 'eu-central', name: 'EU Central (Frankfurt)',   validatorCount: 4,  priority: 2, lat: 50.1, lon: 8.7 },
  { id: 'ap-east',    name: 'Asia Pacific East (Tokyo)',validatorCount: 4,  priority: 2, lat: 35.7, lon: 139.7 },
  { id: 'ap-south',   name: 'Asia Pacific South (Singapore)', validatorCount: 3, priority: 3, lat: 1.3, lon: 103.8 },
  { id: 'sa-east',    name: 'South America East (São Paulo)', validatorCount: 2, priority: 3, lat: -23.5, lon: -46.6 },
  { id: 'af-south',   name: 'Africa South (Cape Town)',validatorCount: 2,  priority: 3, lat: -33.9, lon: 18.4 },
];

// Thresholds that trigger governance proposals
export const THRESHOLDS = {
  regionDegradedValidatorPct: 0.30,  // ≥30% validators offline → degraded
  regionCriticalValidatorPct: 0.50,  // ≥50% offline → critical
  regionOfflineLatencyMs:     5_000, // ≥5 s latency → treat as offline
  nodeOfflineBehindBlocks:    100,   // node behind ≥100 blocks → offline
  meshImbalancePct:           0.25,  // ±25% from target GST balance → rebalance
  globalParticipationMin:     0.67,  // BFT safety floor
  maxProposalsPerCycle:       5,
} as const;
