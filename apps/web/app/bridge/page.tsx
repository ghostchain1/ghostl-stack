import { BridgesOverview } from '../../src/modules/bridge/components/BridgesOverview';
import { TransfersTable } from '../../src/modules/bridge/components/TransfersTable';
import { LiquidityPools } from '../../src/modules/bridge/components/LiquidityPools';
import { DisputesPanel } from '../../src/modules/bridge/components/DisputesPanel';
import { EmergencyControls } from '../../src/modules/bridge/components/EmergencyControls';
import type { Transfer } from '@ghostl/types/bridge';
import { apiFetch } from '../../src/lib/api';

type RawBridge = {
  id?: string;
  pause?: string;
  pending?: string;
  liquidity?: string;
  fees?: string;
};

async function loadBridge() {
  const data = await apiFetch<{ networks?: RawBridge[]; transfers?: any[]; pools?: any[]; summary?: { pending: number; finalized: number; signaturesMissing: number } }>(
    '/api/bridge',
    { fallback: { networks: [] } }
  );
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
  const { bridges, transfers, pools, summary } = await loadBridge();
  const control = { paused: false, feeBps: 0, emergencyMode: false };
  return (
    <div className="content">
      <div className="card-grid">
        <BridgesOverview bridges={bridges} summary={summary} />
        <TransfersTable transfers={transfers} />
        <LiquidityPools pools={pools} />
        <DisputesPanel disputes={[]} />
        <EmergencyControls control={control} />
      </div>
    </div>
  );
}
