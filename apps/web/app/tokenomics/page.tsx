import { SupplyDashboard } from '../../src/modules/tokenomics/components/SupplyDashboard';
import { FeeMarketCard } from '../../src/modules/tokenomics/components/FeeMarketCard';
import { TreasuryOverview } from '../../src/modules/tokenomics/components/TreasuryOverview';
import { PayoutsPanel } from '../../src/modules/tokenomics/components/PayoutsPanel';
import { RevenuePanel } from '../../src/modules/tokenomics/components/RevenuePanel';
import type { SupplySnapshot } from '@ghostl/types/tokenomics';
import { apiFetch } from '../../src/lib/api';

type RawNetwork = {
  id?: string;
  supply?: string;
  emissions?: string;
  multisig?: string;
};

async function loadTokenomics() {
  const data = await apiFetch<{ networks?: RawNetwork[]; feeModel?: { baseFee?: string; targetGas?: string; mode?: string } }>('/api/token', {
    fallback: { networks: [] }
  });
  const snap: SupplySnapshot[] = (data.networks || []).map((n) => ({
    total: n.supply || '?',
    circulating: n.supply || '?',
    burned: '0',
    minted: n.emissions || '?',
    time: new Date().toISOString()
  }));
  const revenue = (data.networks || []).map((n) => ({ source: n.id || 'net', amount: n.multisig || '?' }));
  return { snap, revenue, feeModel: data.feeModel };
}

export default async function TokenomicsPage() {
  const { snap, revenue, feeModel } = await loadTokenomics();
  const model = feeModel || { baseFee: '—', targetGas: '—', mode: 'auto' };
  const balance = { chain: 'l2', native: '—', token: '—' };
  return (
    <div className="content">
      <div className="card-grid">
        <SupplyDashboard snapshots={snap} />
        <FeeMarketCard model={model} />
        <TreasuryOverview balance={balance} recent={[]} />
        <PayoutsPanel payouts={[]} />
        <RevenuePanel items={revenue} />
      </div>
    </div>
  );
}
