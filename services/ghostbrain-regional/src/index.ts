// GhostBrain Regional Control Layer — service entry point
// Port 7927 | 10-second regional control cycle
// DETECT-AND-PROPOSE only — all proposals require human governance ratification.

import http from 'http';
import {
  REGIONAL_PORT,
  CYCLE_INTERVAL_MS,
  DRY_RUN,
  SIGNING_RELAY_URL,
  TOTAL_VALIDATOR_NODES,
  TOTAL_VALIDATOR_CLUSTERS,
  REGION_IDS,
} from './config/regionConfig.js';

import { manageNA }              from './regions/northAmerica.js';
import { manageEU }              from './regions/europe.js';
import { manageAsia }            from './regions/asia.js';
import { routeTraffic }          from './routing/trafficRouter.js';
import { routeValidators }       from './routing/validatorRouter.js';
import { runSecurityMesh }       from './security/securityMesh.js';
import { autoScale }             from './scaling/globalScaler.js';

import type { GlobalStatus, RegionalProposal, RegionMetrics } from './types.js';

let latestStatus: GlobalStatus | null = null;

async function submitProposal(p: RegionalProposal): Promise<void> {
  if (DRY_RUN) {
    console.log('[regional] DRY_RUN proposal:', JSON.stringify(p, null, 2));
    return;
  }
  try {
    const res = await fetch(`${SIGNING_RELAY_URL}/proposals`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(p),
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) console.warn(`[regional] relay rejected ${p.id}: HTTP ${res.status}`);
  } catch (err) {
    console.warn(`[regional] relay unreachable for ${p.id}:`, (err as Error).message);
  }
}

async function regionalLoop(): Promise<void> {
  const cycleAt = Date.now();
  console.log(`\n[regional] ──── GhostBrain Regional Controller cycle @ ${new Date(cycleAt).toISOString()}`);

  // Run all three region managers concurrently
  const [naMetrics, euMetrics, asiaMetrics] = await Promise.all([
    manageNA(),
    manageEU(),
    manageAsia(),
  ]);
  const regions: RegionMetrics[] = [naMetrics, euMetrics, asiaMetrics];

  // Routing, security, scaling
  const { loads, proposals: trafficProps }        = routeTraffic(regions);
  const { balance, proposals: validatorProps }    = routeValidators(regions);
  const { events: secEvents, proposals: secProps } = runSecurityMesh(regions);
  const { actions: scalingActions, proposals: scaleProps } = await autoScale(regions);

  const allProposals: RegionalProposal[] = [
    ...trafficProps,
    ...validatorProps,
    ...secProps,
    ...scaleProps,
  ];

  // Submit proposals
  if (allProposals.length) {
    console.log(`[regional] Submitting ${allProposals.length} proposal(s) to relay`);
    await Promise.all(allProposals.map(submitProposal));
  }

  // Global aggregate metrics
  const avgLatencyMs = Math.round(
    regions.reduce((s, r) => s + r.latencyMs, 0) / regions.length,
  );
  const activeRegions = regions.filter(
    (r) => r.onlinePct >= 50,
  ).length;

  latestStatus = {
    cycleAt,
    totalNodes:        TOTAL_VALIDATOR_NODES,
    activeRegions,
    validatorClusters: TOTAL_VALIDATOR_CLUSTERS,
    avgLatencyMs,
    regions,
    trafficLoads:     loads,
    validatorBalance: balance,
    securityEvents:   secEvents,
    scalingActions,
    activeProposals:  allProposals.length,
    dryRun:           DRY_RUN,
  };

  console.log(
    `[regional] cycle done — activeRegions:${activeRegions}/${REGION_IDS.length}  ` +
    `avgLatency:${avgLatencyMs}ms  secEvents:${secEvents.length}  proposals:${allProposals.length}`,
  );
}

// ── HTTP API ─────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'ghostbrain-regional', port: REGIONAL_PORT }));
    return;
  }

  if (url === '/status') {
    if (!latestStatus) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'initializing' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(latestStatus));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(REGIONAL_PORT, () => {
  console.log(`[regional] GhostBrain Regional Controller listening on :${REGIONAL_PORT}`);
  console.log(`[regional] DRY_RUN=${DRY_RUN}  relay=${SIGNING_RELAY_URL}  cycle=${CYCLE_INTERVAL_MS}ms`);
});

// First cycle immediately, then on interval
regionalLoop().catch((err) => console.error('[regional] cycle error:', err));
setInterval(() => {
  regionalLoop().catch((err) => console.error('[regional] cycle error:', err));
}, CYCLE_INTERVAL_MS);
