/**
 * @file src/scaling/nodeScaler.ts
 * Ghost Global Network Intelligence — Node scaling decision engine.
 *
 * Evaluates the topology snapshot and decides whether to request new RPC/
 * fullnode deployments.  All decisions are forwarded as PROPOSALS to the
 * signing relay via deployNode() — no infrastructure is touched directly.
 */

import { deployNode } from '../deployment/vmDeploy.js';
import { deployCloudNode } from '../deployment/cloudDeploy.js';
import { analyzePeers, needsExpansion } from '../topology/peerAnalyzer.js';
import type { TopologySnapshot, RegionGap } from '../types.js';

function log(level: string, msg: string, extra: object = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, module: 'node-scaler', msg, ...extra }) + '\n'
  );
}

const PEER_MIN         = parseInt(process.env.GNI_PEER_MIN      ?? '5',  10);
const CLOUD_DEPLOY     = (process.env.GNI_CLOUD_DEPLOY ?? '0') === '1';

export async function evaluateScaling(snapshot: TopologySnapshot): Promise<void> {
  const analysis = analyzePeers(snapshot);
  const needsExpand = needsExpansion(snapshot);

  log('info', 'scaling-evaluation', {
    totalPeers:     snapshot.totalPeers,
    minPeers:       snapshot.minPeers,
    avgPeers:       snapshot.avgPeers.toFixed(1),
    unhealthy:      snapshot.unhealthyCount,
    underPeered:    analysis.underPeered.length,
    offline:        analysis.offline.length,
    regionGaps:     snapshot.gaps.length,
    needsExpansion: needsExpand,
  });

  // ── Under-peered RPC nodes ────────────────────────────────────────────────
  for (const node of analysis.underPeered) {
    log('warn', 'under-peered-node', { endpoint: node.endpoint, peers: node.peers, threshold: PEER_MIN });
    if (CLOUD_DEPLOY) {
      await deployCloudNode({ chain: node.chain, region: 'NA', nodeType: 'rpc', reason: `peers=${node.peers} < min=${PEER_MIN}` });
    } else {
      await deployNode({ chain: node.chain, region: 'NA', nodeType: 'rpc', reason: `peers=${node.peers} < min=${PEER_MIN}` });
    }
  }

  // ── Geographic gaps ───────────────────────────────────────────────────────
  for (const gap of snapshot.gaps) {
    await fillRegionGap(gap);
  }
}

async function fillRegionGap(gap: RegionGap): Promise<void> {
  const { region, deficit } = gap;
  log('warn', 'region-gap-detected', {
    region,
    nodeCount: gap.nodeCount,
    target:    gap.minTarget,
    deficit,
  });

  for (let i = 0; i < deficit; i++) {
    if (CLOUD_DEPLOY) {
      await deployCloudNode({ chain: 'l1', region, nodeType: 'rpc', reason: `region gap deficit=${deficit}` });
    } else {
      await deployNode({ chain: 'l1', region, nodeType: 'rpc', reason: `region gap in ${region} deficit=${deficit}` });
    }
  }
}
