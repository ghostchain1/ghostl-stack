/**
 * Network Intrusion Detection System (IDS)
 *
 * Monitors GhostChain L1 / GhostL2 / GhostL3 for network-level threats:
 *
 *   - Eclipse attack: peer count drops abruptly (SSA_PEER_DROP_PCT threshold)
 *   - Block lag: L2 or L3 falls too far behind L1 (SSA_BLOCK_LAG_MAX blocks)
 *   - Chain fork suspicion: block number jumps backwards (reorg)
 *
 * Uses ghost_peerCount and ghost_blockNumber via native http.
 */

import { rpcCall, hexToNumber } from '../rpcHelper.js';
import { recordThreat, notifyGhostBrain } from '../securityBus.js';
import type { NetworkSnapshot, ThreatEvent } from '../types.js';

const L1_RPC       = process.env.L1_RPC_URL ?? 'http://localhost:18545';
const L2_RPC       = process.env.L2_RPC_URL ?? 'http://localhost:29545';
const L3_RPC       = process.env.L3_RPC_URL ?? 'http://localhost:39545';

const PEER_DROP_PCT = Number(process.env.SSA_PEER_DROP_PCT  ?? 0.50); // 50% peer loss
const BLOCK_LAG_MAX = Number(process.env.SSA_BLOCK_LAG_MAX  ?? 50);   // blocks

let _prevSnapshot: NetworkSnapshot | null = null;
let _componentStatus: 'secure' | 'warning' | 'alert' = 'secure';

export function getNetworkStatus(): typeof _componentStatus  { return _componentStatus; }
export function getLastNetworkSnapshot(): NetworkSnapshot | null { return _prevSnapshot; }

async function chainState(
  rpcUrl: string,
): Promise<{ block: number; peers: number } | null> {
  try {
    const [blockHex, peerHex] = await Promise.all([
      rpcCall(rpcUrl, 'ghost_blockNumber', []),
      rpcCall(rpcUrl, 'ghost_peerCount',   []),
    ]);
    return { block: hexToNumber(blockHex), peers: hexToNumber(peerHex) };
  } catch {
    return null;
  }
}

export async function inspectNetwork(): Promise<NetworkSnapshot> {
  const now = Date.now();
  let hasAlert = false;

  const [l1, l2, l3] = await Promise.allSettled([
    chainState(L1_RPC),
    chainState(L2_RPC),
    chainState(L3_RPC),
  ]);

  const l1State = l1.status === 'fulfilled' ? l1.value : null;
  const l2State = l2.status === 'fulfilled' ? l2.value : null;
  const l3State = l3.status === 'fulfilled' ? l3.value : null;

  const snapshot: NetworkSnapshot = {
    ts:       now,
    l1Block:  l1State?.block  ?? -1,
    l2Block:  l2State?.block  ?? -1,
    l3Block:  l3State?.block  ?? -1,
    l1Peers:  l1State?.peers  ?? -1,
    l2Peers:  l2State?.peers  ?? -1,
    l3Peers:  l3State?.peers  ?? -1,
  };

  const prev = _prevSnapshot;

  if (prev) {
    // Eclipse attack detection: abrupt peer count drop
    for (const key of ['l1', 'l2', 'l3'] as const) {
      const currPeers = snapshot[`${key}Peers`];
      const prevPeers = prev[`${key}Peers`];
      if (currPeers >= 0 && prevPeers > 0) {
        const dropRatio = (prevPeers - currPeers) / prevPeers;
        if (dropRatio > PEER_DROP_PCT) {
          hasAlert = true;
          const evt: ThreatEvent = {
            id:          `ssa-network-eclipse-${key}-${Date.now()}`,
            ts:          now,
            category:    'network',
            level:       dropRatio > 0.80 ? 'critical' : 'high',
            title:       `Peer count collapsed on ${key.toUpperCase()} (possible eclipse attack)`,
            description: `${key.toUpperCase()} peer count dropped from ${prevPeers} → ${currPeers} ` +
                         `(${(dropRatio * 100).toFixed(1)}% loss). Possible eclipse or network partition.`,
            source:      key,
            metadata:    { chain: key, prevPeers, currPeers, dropRatio },
          };
          recordThreat(evt);
          await notifyGhostBrain(evt);
        }
      }
    }

    // Block lag: L2 or L3 not keeping up with L1
    if (snapshot.l1Block > 0 && snapshot.l2Block > 0) {
      const lag = snapshot.l1Block - snapshot.l2Block;
      if (lag > BLOCK_LAG_MAX) {
        hasAlert = true;
        const evt: ThreatEvent = {
          id:          `ssa-network-lag-l2-${Date.now()}`,
          ts:          now,
          category:    'network',
          level:       lag > BLOCK_LAG_MAX * 3 ? 'critical' : 'high',
          title:       `GhostL2 block lag: ${lag} blocks behind L1`,
          description: `L1 is at block ${snapshot.l1Block}, L2 is at ${snapshot.l2Block} (${lag} blocks behind). ` +
                       `Settlement and cross-chain messages may be stalled.`,
          source:      L2_RPC,
          metadata:    { l1Block: snapshot.l1Block, l2Block: snapshot.l2Block, lag },
        };
        recordThreat(evt);
        await notifyGhostBrain(evt);
      }
    }

    if (snapshot.l2Block > 0 && snapshot.l3Block > 0) {
      const lag = snapshot.l2Block - snapshot.l3Block;
      if (lag > BLOCK_LAG_MAX) {
        const evt: ThreatEvent = {
          id:          `ssa-network-lag-l3-${Date.now()}`,
          ts:          now,
          category:    'network',
          level:       'high',
          title:       `GhostL3 block lag: ${lag} blocks behind L2`,
          description: `L2 is at block ${snapshot.l2Block}, L3 is at ${snapshot.l3Block} (${lag} blocks behind).`,
          source:      L3_RPC,
          metadata:    { l2Block: snapshot.l2Block, l3Block: snapshot.l3Block, lag },
        };
        recordThreat(evt);
      }
    }

    // Potential reorg: block number decreases
    for (const key of ['l1', 'l2', 'l3'] as const) {
      const curr = snapshot[`${key}Block`];
      const prevB = prev[`${key}Block`];
      if (curr > 0 && prevB > 0 && curr < prevB) {
        hasAlert = true;
        const evt: ThreatEvent = {
          id:          `ssa-network-reorg-${key}-${Date.now()}`,
          ts:          now,
          category:    'network',
          level:       'critical',
          title:       `Block number decreased on ${key.toUpperCase()} — possible reorg`,
          description: `${key.toUpperCase()} block went from ${prevB} → ${curr}. This may indicate a deep chain reorganisation.`,
          source:      key,
          metadata:    { chain: key, prevBlock: prevB, currBlock: curr },
        };
        recordThreat(evt);
        await notifyGhostBrain(evt);
      }
    }
  }

  _prevSnapshot    = snapshot;
  _componentStatus = hasAlert ? 'alert' : 'secure';

  console.log(
    `[SSA:network] L1=${snapshot.l1Block}(peers:${snapshot.l1Peers}) ` +
    `L2=${snapshot.l2Block}(${snapshot.l2Peers}) L3=${snapshot.l3Block}(${snapshot.l3Peers}) — ${_componentStatus}`
  );

  return snapshot;
}
