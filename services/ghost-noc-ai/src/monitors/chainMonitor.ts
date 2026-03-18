import type { MonitorResult, NocAlert } from '../types.js';

const CHAINS = [
  { name: 'GhostChain L1', id: 'l1', rpc: process.env.L1_RPC_URL ?? 'http://localhost:18545', chainId: 14000101 },
  { name: 'GhostL2',       id: 'l2', rpc: process.env.L2_RPC_URL ?? 'http://localhost:29547', chainId: 901 },
  { name: 'GhostL3',       id: 'l3', rpc: process.env.L3_RPC_URL ?? 'http://localhost:39545', chainId: 903 },
];

function makeAlert(source: string, severity: NocAlert['severity'], message: string): NocAlert {
  return {
    id:        `noc-chain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    severity,
    source,
    monitor:   'chainMonitor',
    message,
    timestamp: new Date().toISOString(),
    resolved:  false,
  };
}

async function getBlockNumber(rpcUrl: string): Promise<bigint | null> {
  try {
    const res = await fetch(rpcUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', method: 'ghost_blockNumber', params: [], id: 1 }),
      signal:  AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { result?: string };
    return data.result ? BigInt(data.result) : null;
  } catch {
    return null;
  }
}

const lastBlock: Record<string, bigint | null> = {};
const lastBlockTime: Record<string, number> = {};

export async function runChainMonitor(): Promise<MonitorResult> {
  const alerts: NocAlert[] = [];

  await Promise.all(CHAINS.map(async (chain) => {
    const block = await getBlockNumber(chain.rpc);

    if (block === null) {
      alerts.push(makeAlert(chain.name, 'critical', `${chain.name} RPC unresponsive (chainId ${chain.chainId}, port ${new URL(chain.rpc).port})`));
      return;
    }

    const prev = lastBlock[chain.id];
    const prevTime = lastBlockTime[chain.id];
    const now = Date.now();

    if (prev !== undefined && prev !== null && prevTime) {
      const elapsed = now - prevTime;
      if (block === prev && elapsed > 120_000) {
        // No new block in >2min — chain may be stalled
        alerts.push(makeAlert(chain.name, 'warning', `${chain.name} appears stalled at block ${prev} for ${Math.round(elapsed / 1000)}s`));
      }
    }

    if (prev === undefined || block !== prev) {
      lastBlock[chain.id] = block;
      lastBlockTime[chain.id] = now;
    }
  }));

  return { alerts, proposals: [] };
}
