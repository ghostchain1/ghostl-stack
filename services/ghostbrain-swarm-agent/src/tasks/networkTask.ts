// networkTask — reads real network topology / peer data from BFF API
// Never uses Math.random(); all values come from live endpoints.
import { publish } from '../communication/swarmBus.js';
import type { SwarmMessage } from '../communication/swarmProtocol.js';
import { CONFIG, AGENT_ID } from '../config/agentConfig.js';

interface TopologyNode {
  id: string;
  peers?: number;
  status?: string;
  chainId?: number;
}

interface TopologyPayload {
  nodes?: TopologyNode[];
  peerCount?: number;
  chainStatus?: string;
  blockLag?: number;
}

async function fetchTopology(): Promise<TopologyPayload> {
  const resp = await fetch(
    `${CONFIG.apiBase}/api/network/topology`,
    { signal: AbortSignal.timeout(8_000) },
  );
  if (!resp.ok) throw new Error(`network/topology ${resp.status}`);
  return resp.json() as Promise<TopologyPayload>;
}

export async function runNetworkTask(): Promise<void> {
  let topo: TopologyPayload;
  try {
    topo = await fetchTopology();
  } catch (err) {
    console.warn('[networkTask] fetch failed:', (err as Error).message);
    return;
  }

  const now = new Date().toISOString();
  const alerts: SwarmMessage[] = [];

  const peerCount = topo.peerCount ?? topo.nodes?.length ?? 0;

  // Low peer count
  if (peerCount < CONFIG.minPeerCount) {
    alerts.push({
      agentId: AGENT_ID,
      nodeType: CONFIG.nodeType,
      topic: 'network.alert',
      severity: peerCount === 0 ? 'critical' : 'warning',
      type: 'low_peers',
      value: peerCount,
      detail: `Only ${peerCount} peers visible (minimum ${CONFIG.minPeerCount})`,
      payload: { peerCount, nodes: topo.nodes?.length ?? 0 },
      ts: now,
    });
  }

  // Chain status degraded
  if (topo.chainStatus && topo.chainStatus !== 'healthy' && topo.chainStatus !== 'synced') {
    alerts.push({
      agentId: AGENT_ID,
      nodeType: CONFIG.nodeType,
      topic: 'network.alert',
      severity: 'warning',
      type: 'chain_degraded',
      detail: `Chain status reported as "${topo.chainStatus}"`,
      payload: { chainStatus: topo.chainStatus, blockLag: topo.blockLag ?? null },
      ts: now,
    });
  }

  // Block lag
  if (topo.blockLag !== undefined && topo.blockLag > 100) {
    alerts.push({
      agentId: AGENT_ID,
      nodeType: CONFIG.nodeType,
      topic: 'network.alert',
      severity: topo.blockLag > 500 ? 'critical' : 'warning',
      type: 'block_lag',
      value: topo.blockLag,
      detail: `Block lag of ${topo.blockLag} blocks detected`,
      payload: { blockLag: topo.blockLag },
      ts: now,
    });
  }

  for (const alert of alerts) {
    publish('network.alert', alert);
    console.info(`[networkTask] published ${alert.type} (${alert.severity})`);
  }
}
