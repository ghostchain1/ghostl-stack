// GhostBrain Planet-Scale Architecture — service entry point
// Port 7926 | 60-second strategy cycle
// DETECT-AND-PROPOSE only — all governance proposals require human ratification.

import http from 'http';
import {
  PLANET_PORT,
  CYCLE_INTERVAL_MS,
  DRY_RUN,
  SIGNING_RELAY_URL,
  THRESHOLDS,
} from './config/planetConfig.js';

import { assessRegions }                    from './regions/regionManager.js';
import { detectAlerts }                     from './regions/regionHealthMonitor.js';
import { computeFailoverActions, failoverProposals } from './regions/regionFailover.js';

import { snapshotConsensus }                from './consensus/offlineConsensus.js';
import { detectPendingSyncs, syncProposals } from './consensus/consensusSync.js';

import { buildLiquidityMesh }               from './liquidity/globalLiquidityMesh.js';
import { computeRebalanceActions, rebalanceProposals } from './liquidity/meshRebalancer.js';

import { gatherInterchainSignals, coordinationProposals } from './coordination/interchainCoordinator.js';
import {
  publishRegionAlerts,
  publishFailoverEvents,
  publishMeshImbalances,
  recentEvents,
} from './coordination/aiSyncBus.js';

import type { PlanetProposal, PlanetSnapshot } from './types.js';

let latestSnapshot: PlanetSnapshot | null = null;

async function submitProposal(proposal: PlanetProposal): Promise<void> {
  if (DRY_RUN) {
    console.log('[planet] DRY_RUN proposal:', JSON.stringify(proposal, null, 2));
    return;
  }
  try {
    const res = await fetch(`${SIGNING_RELAY_URL}/proposals`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(proposal),
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn(`[planet] relay rejected proposal ${proposal.id}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[planet] relay unreachable for proposal ${proposal.id}:`, (err as Error).message);
  }
}

async function planetCycle(): Promise<void> {
  const cycleAt = Date.now();
  console.log(`[planet] cycle starting at ${new Date(cycleAt).toISOString()}`);

  const [regions, consensus, mesh, interchainMessages, pendingSyncs] =
    await Promise.all([
      assessRegions(),
      snapshotConsensus(),
      buildLiquidityMesh(),
      gatherInterchainSignals(),
      detectPendingSyncs(),
    ]);

  // Enrich consensus snapshot with sync backlog
  consensus.pendingSyncs = pendingSyncs;

  // Compute decisions
  const alerts          = detectAlerts(regions);
  const failoverActions = computeFailoverActions(regions);
  const rebalanceActions = computeRebalanceActions(mesh);

  // Publish to AI sync bus
  publishRegionAlerts(regions);
  publishFailoverEvents(failoverActions);
  publishMeshImbalances(mesh.imbalances);

  // Assemble proposals (cap at THRESHOLDS.maxProposalsPerCycle)
  const budget = THRESHOLDS.maxProposalsPerCycle;
  const proposals: PlanetProposal[] = [
    ...failoverProposals(failoverActions, Math.floor(budget * 0.3)),
    ...syncProposals(pendingSyncs, Math.floor(budget * 0.2)),
    ...rebalanceProposals(rebalanceActions, Math.floor(budget * 0.3)),
    ...coordinationProposals(interchainMessages, Math.floor(budget * 0.2)),
  ].slice(0, budget);

  // Log alerts
  if (alerts.length) {
    console.log(`[planet] ${alerts.length} alert(s):`);
    alerts.forEach((a) => console.log(`  [${a.severity}] ${a.regionId}: ${a.detail}`));
  }

  // Submit proposals
  if (proposals.length) {
    console.log(`[planet] submitting ${proposals.length} proposal(s) to relay`);
    await Promise.all(proposals.map(submitProposal));
  }

  latestSnapshot = {
    cycleAt,
    regions,
    consensus,
    liquidityMesh: mesh,
    failoverActions,
    pendingRebalances: rebalanceActions,
    syncBacklog:   pendingSyncs,
    activeProposals: proposals.length,
  };

  console.log(
    `[planet] cycle done — regions:${regions.length} consensus:${consensus.onlineNodes}/${consensus.totalNodes} ` +
    `mesh-imbalances:${mesh.imbalances.length} proposals:${proposals.length}`,
  );
}

// ── HTTP status API ──────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'ghostbrain-planet', port: PLANET_PORT }));
    return;
  }

  if (url === '/status') {
    if (!latestSnapshot) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'initializing' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ...latestSnapshot,
        // Serialize bigints to strings for JSON transport
        liquidityMesh: {
          ...latestSnapshot.liquidityMesh,
          totalGstLocked: latestSnapshot.liquidityMesh.totalGstLocked.toString(),
          nodes: latestSnapshot.liquidityMesh.nodes.map((n) => ({
            ...n,
            gstBalance:    n.gstBalance.toString(),
            targetBalance: n.targetBalance.toString(),
          })),
          imbalances: latestSnapshot.liquidityMesh.imbalances.map((i) => ({
            ...i,
            deltaGst: i.deltaGst.toString(),
          })),
        },
        pendingRebalances: latestSnapshot.pendingRebalances.map((r) => ({
          ...r,
          amountGst: r.amountGst.toString(),
        })),
        recentEvents: recentEvents(30),
        dryRun: DRY_RUN,
      }),
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PLANET_PORT, () => {
  console.log(`[planet] GhostBrain Planet-Scale Architecture listening on :${PLANET_PORT}`);
  console.log(`[planet] DRY_RUN=${DRY_RUN}  relay=${SIGNING_RELAY_URL}  cycle=${CYCLE_INTERVAL_MS}ms`);
});

// Run first cycle immediately, then on interval
planetCycle().catch((err) => console.error('[planet] cycle error:', err));
setInterval(() => {
  planetCycle().catch((err) => console.error('[planet] cycle error:', err));
}, CYCLE_INTERVAL_MS);
