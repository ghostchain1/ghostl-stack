// Regional Control Layer — canonical configuration

import type { RegionId, CloudProvider } from '../types.js';

export interface RegionDef {
  id:               RegionId;
  name:             string;
  targetValidators: number;
  rpcUrl:           string;          // always points to GhostChain L1 for that region
  latencyTargetMs:  number;
  loadThreshold:    number;          // 0–100; above this → reroute
  cloud:            CloudProvider[];
}

export const REGIONS: Record<RegionId, RegionDef> = {
  'north-america': {
    id:               'north-america',
    name:             'North America',
    targetValidators: 10,
    rpcUrl:           process.env['GHOST_L1_RPC_NA']   ?? 'http://localhost:18545',
    latencyTargetMs:  100,
    loadThreshold:    80,
    cloud:            ['bare-metal', 'aws', 'hetzner'],
  },
  'europe': {
    id:               'europe',
    name:             'Europe',
    targetValidators: 8,
    rpcUrl:           process.env['GHOST_L1_RPC_EU']   ?? 'http://localhost:18545',
    latencyTargetMs:  80,
    loadThreshold:    80,
    cloud:            ['bare-metal', 'hetzner', 'google-cloud'],
  },
  'asia': {
    id:               'asia',
    name:             'Asia',
    targetValidators: 6,
    rpcUrl:           process.env['GHOST_L1_RPC_ASIA'] ?? 'http://localhost:18545',
    latencyTargetMs:  120,
    loadThreshold:    75,
    cloud:            ['bare-metal', 'edge', 'google-cloud'],
  },
};

// Derived ordered list
export const REGION_IDS: RegionId[] = ['north-america', 'europe', 'asia'];

export const REGIONAL_PORT      = Number(process.env['REGIONAL_PORT']     ?? 7927);
export const CYCLE_INTERVAL_MS  = Number(process.env['REGIONAL_CYCLE_MS'] ?? 10_000);
export const DRY_RUN            = process.env['REGIONAL_DRY_RUN'] === '1';
export const SIGNING_RELAY_URL  = process.env['SIGNING_RELAY_URL'] ?? 'http://localhost:7910';
export const API_BASE           = process.env['GHOSTSTACK_API_BASE'] ?? 'http://localhost:3000';

// Total node count across all regions (validators per region × 24 full/observer nodes assumed)
export const TOTAL_VALIDATOR_NODES = Object.values(REGIONS)
  .reduce((s, r) => s + r.targetValidators, 0);                     // 24
export const TOTAL_VALIDATOR_CLUSTERS = REGION_IDS.length;          // 3
