/**
 * @file src/regions/geoAnalyzer.ts
 * Ghost Global Network Intelligence — Geographic distribution analysis.
 *
 * Maps node IPs to regions and identifies deployment gaps.
 * Uses geoip-lite for offline IP→geo resolution (no external API calls).
 */

import geoip from 'geoip-lite';
import type { NodeInfo, RegionCode, RegionGap, RegionNode } from '../types.js';

// Country code → GNI macro-region
const COUNTRY_TO_REGION: Record<string, RegionCode> = {
  // North America
  US: 'NA', CA: 'NA', MX: 'NA',
  // Europe
  GB: 'EU', DE: 'EU', FR: 'EU', NL: 'EU', SE: 'EU', NO: 'EU',
  FI: 'EU', PL: 'EU', ES: 'EU', IT: 'EU', CH: 'EU', AT: 'EU',
  BE: 'EU', DK: 'EU', CZ: 'EU', PT: 'EU', IE: 'EU', RO: 'EU',
  // Asia-Pacific
  JP: 'AS', KR: 'AS', SG: 'AS', HK: 'AS', TW: 'AS', IN: 'AS',
  CN: 'AS', ID: 'AS', MY: 'AS', TH: 'AS', VN: 'AS', PH: 'AS',
  AU: 'OC', NZ: 'OC',
  // South America
  BR: 'SA', AR: 'SA', CL: 'SA', CO: 'SA', PE: 'SA',
  // Africa / Middle East
  ZA: 'AF', NG: 'AF', KE: 'AF', EG: 'AF', AE: 'AF',
};

// Minimum nodes per region for balanced global coverage
const REGION_TARGETS: Record<RegionCode, number> = {
  NA:      2,
  EU:      2,
  AS:      2,
  SA:      1,
  OC:      1,
  AF:      1,
  UNKNOWN: 0,
};

function ipToRegion(ip: string): { country: string; region: RegionCode; lat: number; lon: number } {
  // Only look up valid public IPs — skip loopback / private ranges
  if (ip.startsWith('127.') || ip.startsWith('::1') ||
      ip.startsWith('10.')  || ip.startsWith('192.168.') ||
      ip === 'localhost') {
    return { country: 'PRIVATE', region: 'UNKNOWN', lat: 0, lon: 0 };
  }
  try {
    const geo = geoip.lookup(ip);
    if (!geo) return { country: 'UNKNOWN', region: 'UNKNOWN', lat: 0, lon: 0 };
    const region: RegionCode = COUNTRY_TO_REGION[geo.country] ?? 'UNKNOWN';
    return { country: geo.country, region, lat: geo.ll[0], lon: geo.ll[1] };
  } catch {
    return { country: 'UNKNOWN', region: 'UNKNOWN', lat: 0, lon: 0 };
  }
}

/** Extract IP from an RPC URL (hostname part). */
function extractIp(endpointUrl: string): string {
  try {
    return new URL(endpointUrl).hostname;
  } catch {
    return 'unknown';
  }
}

export function detectGaps(nodes: NodeInfo[]): RegionGap[] {
  // Count nodes per region
  const regionCounts = new Map<RegionCode, number>();
  for (const node of nodes) {
    if (!node.healthy) continue;
    const ip   = extractIp(node.endpoint);
    const { region } = ipToRegion(ip);
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
  }

  const gaps: RegionGap[] = [];
  for (const [region, target] of Object.entries(REGION_TARGETS) as [RegionCode, number][]) {
    if (target === 0) continue;
    const count   = regionCounts.get(region) ?? 0;
    const deficit = Math.max(0, target - count);
    if (deficit > 0) {
      gaps.push({ region, nodeCount: count, minTarget: target, deficit });
    }
  }
  return gaps;
}

export function buildRegionMap(nodes: NodeInfo[]): RegionNode[] {
  const seen = new Map<string, RegionNode>();
  for (const node of nodes) {
    const ip   = extractIp(node.endpoint);
    const geo  = ipToRegion(ip);
    const key  = geo.region + ':' + geo.country;
    const existing = seen.get(key);
    if (existing) {
      existing.nodeCount++;
    } else {
      seen.set(key, {
        ip,
        country:   geo.country,
        region:    geo.region,
        lat:       geo.lat,
        lon:       geo.lon,
        nodeCount: 1,
      });
    }
  }
  return [...seen.values()];
}

export function detectRegion(ip: string): RegionCode {
  return ipToRegion(ip).region;
}
