import Link from 'next/link';
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
      {/* ── Constitutional GST Parameters ──────────────────────────────── */}
      <div style={{
        background: 'rgba(201,162,39,0.05)',
        border: '1px solid rgba(201,162,39,0.18)',
        borderRadius: 10,
        padding: '20px 24px',
        marginBottom: 20,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#C9A227', marginBottom: 4 }}>
              Constitutional Parameters — GST Tokenomics v1.0
            </div>
            <div style={{ fontSize: '0.78rem', color: '#8A9BB5' }}>Ghost Sovereign Token · Governance-locked · Invariant-enforced</div>
          </div>
          <Link href="/econ/financials" style={{
            background: 'rgba(201,162,39,0.1)', color: '#C9A227',
            padding: '7px 14px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 600,
            textDecoration: 'none', border: '1px solid rgba(201,162,39,0.3)',
          }}>
            5-Year Model →
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {[
            { label: 'Symbol',          value: 'GST',                                        mono: true  },
            { label: 'Genesis Supply',  value: '1,000,000,000',                              mono: false },
            { label: 'Decimals',        value: '18',                                         mono: true  },
            { label: 'Base Burn Rate',  value: '2.0% per epoch',                             mono: false },
            { label: 'Burn Sensitivity', value: 'κ = 0.10 (gov-adj)',                                mono: true  },
            { label: 'Buyback Ratio',   value: '15% of net yield',                           mono: false },
            { label: 'Reserve Floor',   value: '20% of treasury',                            mono: false },
            { label: 'L2→L1 Route',     value: '70% of L2 native fees',                      mono: false },
          ].map((p) => (
            <div key={p.label} style={{ background: 'rgba(201,162,39,0.05)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8A9BB5', marginBottom: 4 }}>{p.label}</div>
              <div style={{
                fontSize: '0.82rem', fontWeight: 700, color: '#C9A227',
                fontFamily: p.mono ? "'JetBrains Mono', 'Fira Code', monospace" : 'inherit',
              }}>
                {p.value || (p as any).mono}
              </div>
            </div>
          ))}
        </div>

        {/* Supply formula */}
        <div style={{
          marginTop: 16,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 6, padding: '10px 14px',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: '0.72rem', color: '#8A9BB5',
          lineHeight: 1.8,
        }}>
          <span style={{ color: '#00F0B5' }}>S(t) = S₀ − B(t) − R(t) + E(t)</span>
          {'  '}
          <span style={{ color: '#8A9BB5', fontSize: '0.65rem' }}>
            {' '}// Design: B(t) + R(t) {'>'} E(t) — net deflationary
          </span>
        </div>

        {/* Fee routing */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8A9BB5' }}>Fee Routing Law:</span>
          {[
            { label: 'L3 Fees', color: '#00C2FF' },
            { label: '→', color: '#7A5CFF' },
            { label: 'L2 (100%)', color: '#7A5CFF' },
            { label: '→', color: '#7A5CFF' },
            { label: 'L1 Treasury (70%)', color: '#C9A227' },
          ].map((item, i) => (
            item.label === '→' ? (
              <span key={i} style={{ color: '#7A5CFF', fontSize: '0.85rem', fontWeight: 700 }}>→</span>
            ) : (
              <span key={i} style={{ fontSize: '0.72rem', fontWeight: 600, color: item.color }}>{item.label}</span>
            )
          ))}
          <span style={{ fontSize: '0.62rem', color: '#8A9BB5', marginLeft: 4 }}>· L3 → L1 direct: FORBIDDEN</span>
        </div>
      </div>
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
