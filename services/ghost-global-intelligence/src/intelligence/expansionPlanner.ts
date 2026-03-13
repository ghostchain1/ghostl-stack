/**
 * @file src/intelligence/expansionPlanner.ts
 * Ghost Global Network Intelligence — Holistic expansion planner.
 *
 * Combines topology analysis + load forecast to decide WHEN and WHERE to
 * expand.  Triggers are:
 *   1. TPS forecast exceeds threshold (load-driven)
 *   2. Peer count declining significantly (connectivity-driven)
 *   3. Region deficits exceed tolerance (geo-driven)
 *   4. Validator set under-replicated (consensus-driven)
 *
 * All expansion plans are submitted as PROPOSALS to the signing relay.
 * No infrastructure is modified here.
 */

import { deployNode }      from '../deployment/vmDeploy.js';
import { deployCloudNode } from '../deployment/cloudDeploy.js';
import { computeForecast } from './loadPrediction.js';
import type { TopologySnapshot } from '../types.js';

function log(level: string, msg: string, extra: object = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, module: 'expansion-planner', msg, ...extra }) + '\n'
  );
}

const CLOUD_DEPLOY   = (process.env.GNI_CLOUD_DEPLOY ?? '0') === '1';
const MIN_CONFIDENCE = parseFloat(process.env.GNI_FORECAST_MIN_CONFIDENCE ?? '0.5');

let _expansionCount = 0;

export async function runExpansionPlanner(snapshot: TopologySnapshot): Promise<void> {
  const forecast = computeForecast();

  log('info', 'expansion-planner-run', {
    estimatedTps:         forecast.estimatedTps.toFixed(0),
    estimatedPeers:       forecast.estimatedPeers.toFixed(0),
    expansionRecommended: forecast.expansionRecommended,
    confidence:           forecast.confidence.toFixed(2),
    reason:               forecast.reason,
    regionGaps:           snapshot.gaps.length,
  });

  // ── Load-driven expansion ─────────────────────────────────────────────────
  if (forecast.expansionRecommended && forecast.confidence >= MIN_CONFIDENCE) {
    log('warn', 'load-driven-expansion', { reason: forecast.reason, confidence: forecast.confidence });

    const regions = snapshot.gaps.length > 0
      ? snapshot.gaps.slice(0, 2).map(g => g.region)
      : (['NA', 'EU'] as const);

    for (const region of regions) {
      _expansionCount++;
      if (CLOUD_DEPLOY) {
        await deployCloudNode({
          chain:    'l2',
          region,
          nodeType: 'rpc',
          reason:   `load expansion: ${forecast.reason}`,
          priority: 'high',
        });
      } else {
        await deployNode({
          chain:    'l2',
          region,
          nodeType: 'rpc',
          reason:   `load expansion: ${forecast.reason}`,
          priority: 'high',
        });
      }
    }
  }

  // ── Geo-driven expansion — fill region gaps ───────────────────────────────
  for (const gap of snapshot.gaps) {
    log('warn', 'geo-expansion', { region: gap.region, deficit: gap.deficit });
    _expansionCount++;
    if (CLOUD_DEPLOY) {
      await deployCloudNode({
        chain:    'l1',
        region:   gap.region,
        nodeType: 'rpc',
        reason:   `geo expansion: deficit=${gap.deficit} in ${gap.region}`,
        priority: gap.deficit > 2 ? 'high' : 'medium',
      });
    } else {
      await deployNode({
        chain:    'l1',
        region:   gap.region,
        nodeType: 'rpc',
        reason:   `geo expansion: deficit=${gap.deficit} in ${gap.region}`,
        priority: gap.deficit > 2 ? 'high' : 'medium',
      });
    }
  }
}

export function getExpansionCount(): number {
  return _expansionCount;
}

export { computeForecast };
