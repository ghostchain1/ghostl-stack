import { SupplyDashboard } from '../../src/modules/tokenomics/components/SupplyDashboard';
import { FeeMarketCard } from '../../src/modules/tokenomics/components/FeeMarketCard';
import { TreasuryOverview } from '../../src/modules/tokenomics/components/TreasuryOverview';
import { PayoutsPanel } from '../../src/modules/tokenomics/components/PayoutsPanel';
import { RevenuePanel } from '../../src/modules/tokenomics/components/RevenuePanel';
import type { SupplySnapshot, TreasuryTx } from '@ghostl/types/tokenomics';
import type { ApiError } from '../../src/lib/api';
import { serverApiRequest } from '../../src/lib/server-api';
import { DataFetchErrorCard } from '../../src/components/DataFetchErrorCard';

type RawNetwork = {
  id?: string;
  supply?: string;
  emissions?: string;
  multisig?: string;
};

async function loadTokenomics() {
  const [tokenRes, payoutsRes] = await Promise.all([
    serverApiRequest<{ networks?: RawNetwork[]; feeModel?: { baseFee?: string; targetGas?: string; mode?: string } }>(
      '/api/token',
      { init: { cache: 'no-store' } }
    ),
    serverApiRequest<{ payouts?: TreasuryTx[] }>('/api/treasury/payouts', { init: { cache: 'no-store' } })
  ]);
  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!tokenRes.ok) errors.push({ title: 'Tokenomics summary', error: tokenRes.error });
  if (!payoutsRes.ok) errors.push({ title: 'Treasury payouts', error: payoutsRes.error });

  const data = tokenRes.ok ? tokenRes.data : { networks: [], feeModel: undefined };
  const snap: SupplySnapshot[] = (data.networks || []).map((n) => ({
    total: n.supply || '0',
    circulating: n.supply || '0',
    burned: '0',
    minted: n.emissions || '0',
    time: new Date().toISOString()
  }));
  const revenue = (data.networks || []).map((n) => ({ source: n.id || 'net', amount: n.multisig || '0' }));
  const payouts = payoutsRes.ok ? payoutsRes.data.payouts || [] : [];
  return { snap, revenue, feeModel: data.feeModel, errors, payouts };
}

export default async function TokenomicsPage() {
  const { snap, revenue, feeModel, errors, payouts } = await loadTokenomics();
  const model = feeModel || { baseFee: 'n/a', targetGas: 'n/a', mode: 'n/a' };
  const treasuryBalance = revenue[0]?.amount;
  const balance = { chain: revenue[0]?.source || 'l2', native: treasuryBalance };
  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        <SupplyDashboard snapshots={snap} />
        <FeeMarketCard model={model} />
        <TreasuryOverview balance={balance} recent={[]} />
        {errors.find((e) => e.title === 'Treasury payouts') ? null : <PayoutsPanel payouts={payouts} />}
        <RevenuePanel items={revenue} />
      </div>
    </div>
  );
}
