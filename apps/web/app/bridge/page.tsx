import { BridgesOverview } from '../../src/modules/bridge/components/BridgesOverview';
import { TransfersTable } from '../../src/modules/bridge/components/TransfersTable';
import { LiquidityPools } from '../../src/modules/bridge/components/LiquidityPools';
import { DisputesPanel } from '../../src/modules/bridge/components/DisputesPanel';
import { EmergencyControls } from '../../src/modules/bridge/components/EmergencyControls';
import { BridgeMetrics } from '../../src/modules/bridge/components/BridgeMetrics';
import type { Transfer } from '@ghostl/types/bridge';
import { serverApiRequest } from '../../src/lib/server-api';
import { DataFetchErrorCard } from '../../src/components/DataFetchErrorCard';

type RawBridge = {
  id?: string;
  pause?: string;
  pending?: string;
  liquidity?: string;
  fees?: string;
};

async function loadBridge() {
  const result = await serverApiRequest<{
    networks?: RawBridge[];
    transfers?: any[];
    pools?: any[];
    summary?: { pending: number; finalized: number; signaturesMissing: number };
  }>('/api/bridge', { init: { cache: 'no-store' } });
  if (!result.ok) {
    return { error: result.error };
  }
  const data = result.data;
  const bridges = (data.networks || []).map((n) => ({
    id: n.id || 'unknown',
    src: 'l2',
    dst: 'l3',
    status: n.pause || 'live'
  }));
  const transfers: Transfer[] = (data.transfers || []).map((t) => ({
    id: t.id || 'tx',
    srcChain: t.srcChain || t.src || 'l2',
    dstChain: t.dstChain || t.dst || 'l3',
    status: t.status || 'pending',
    amount: t.amount || '0',
    txs: t.txs || [],
    signatures: t.signatures || [],
    requiredSignatures: t.requiredSignatures || 2
  }));
  const pools = (data.pools || []).map((p: any) => ({
    id: p.id || 'pool',
    chain: p.chain || 'l2',
    liquidity: p.liquidity || '?',
    fee: p.fee || p.fees || p.pause || ''
  }));
  return { bridges, transfers, pools, summary: data.summary };
}

export default async function BridgePage() {
  const data = await loadBridge();
  if ('error' in data) {
    return (
      <div className="content">
        <div className="card-grid">
          <DataFetchErrorCard title="Bridge data" error={data.error} />
        </div>
      </div>
    );
  }
  const { bridges, transfers, pools, summary } = data;
  const control = { paused: false, feeBps: 0, emergencyMode: false };
  return (
    <div className="content">
      <div className="card-grid">
        <BridgesOverview bridges={bridges} summary={summary} />
        <BridgeMetrics summary={summary} />
        <TransfersTable transfers={transfers} />
        <LiquidityPools pools={pools} />
        <DisputesPanel disputes={[]} />
        <EmergencyControls control={control} />
      </div>
    </div>
  );
}
