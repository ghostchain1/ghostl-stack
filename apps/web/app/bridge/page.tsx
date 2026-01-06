import { BridgesOverview } from '../../src/modules/bridge/components/BridgesOverview';
import { TransfersTable } from '../../src/modules/bridge/components/TransfersTable';
import { LiquidityPools } from '../../src/modules/bridge/components/LiquidityPools';
import { DisputesPanel } from '../../src/modules/bridge/components/DisputesPanel';
import { EmergencyControls } from '../../src/modules/bridge/components/EmergencyControls';
import type { Transfer } from '@ghostchain/types/bridge';
import { apiFetch } from '../../src/lib/api';

async function loadBridge() {
  const data = await apiFetch<{ networks?: any[]; ok?: boolean }>('/api/bridge', { fallback: { networks: [] } });
  const bridges = (data.networks || []).map((n) => ({
    id: n.id || 'unknown',
    src: 'l2',
    dst: 'l3',
    status: n.pause || 'live'
  }));
  const transfers: Transfer[] = (data.networks || []).map((n) => ({
    id: n.id || 'tx',
    srcChain: n.id || 'l2',
    dstChain: n.id === 'l2' ? 'l3' : 'l2',
    status: 'pending',
    amount: n.pending || '0',
    txs: []
  }));
  const pools = (data.networks || []).map((n) => ({
    id: n.id || 'pool',
    chain: n.id || 'l2',
    liquidity: n.liquidity || '?',
    fee: n.fees || n.pause || ''
  }));
  return { bridges, transfers, pools };
}

export default async function BridgePage() {
  const { bridges, transfers, pools } = await loadBridge();
  const control = { paused: false, feeBps: 0, emergencyMode: false };
  return (
    <div className="content">
      <div className="card-grid">
        <BridgesOverview bridges={bridges} />
        <TransfersTable transfers={transfers} />
        <LiquidityPools pools={pools} />
        <DisputesPanel disputes={[]} />
        <EmergencyControls control={control} />
      </div>
    </div>
  );
}
