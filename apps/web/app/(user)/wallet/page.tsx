'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type TokenBalance = {
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  change24h: number;
  layer: 'L1' | 'L2' | 'L3';
};

type TxEntry = {
  hash: string;
  type: 'send' | 'receive' | 'bridge' | 'swap' | 'stake';
  amount: string;
  symbol: string;
  from: string;
  to: string;
  status: 'confirmed' | 'pending' | 'failed';
  layer: string;
  time: string;
};

type WalletData = {
  address: string;
  totalGst: string;
  usdEquivalent: string;
  stakedGst: string;
  pendingRewards: string;
  balances: TokenBalance[];
  transactions: TxEntry[];
};

function short(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

const TYPE_LABEL: Record<string, string> = {
  send: '↑ Send', receive: '↓ Receive', bridge: '⇆ Bridge', swap: '⇄ Swap', stake: '⬡ Stake'
};
const TYPE_COLOR: Record<string, string> = {
  send: 'var(--danger)', receive: 'var(--success)', bridge: 'var(--accent-3)',
  swap: 'var(--accent)', stake: 'var(--accent-2)'
};

export default function WalletPage() {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'balances' | 'transactions' | 'staking'>('balances');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet', { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const balances: TokenBalance[] = data?.balances ?? [
    { symbol: 'GST', name: 'GhostChain Token', balance: '0.000', usdValue: '$0.00', change24h: 0, layer: 'L1' },
  ];
  const txs: TxEntry[] = data?.transactions ?? [];

  return (
    <div className="portal-page">
      <div className="portal-header">
        <h1 className="portal-title">Wallet</h1>
        <p className="portal-subtitle">GST balances, transactions, and staking across L1 / L2 / L3</p>
      </div>

      {/* KPI row */}
      <div className="kpi-grid">
        {[
          { label: 'Total GST', value: loading ? '…' : (data?.totalGst ?? '—'), foot: 'native balance' },
          { label: 'USD Equivalent', value: loading ? '…' : (data?.usdEquivalent ?? '—'), foot: 'estimated' },
          { label: 'Staked GST', value: loading ? '…' : (data?.stakedGst ?? '—'), foot: 'earning rewards' },
          { label: 'Pending Rewards', value: loading ? '…' : (data?.pendingRewards ?? '—'), foot: 'claimable' },
        ].map(({ label, value, foot }) => (
          <div key={label} className="kpi-card">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{value}</div>
            <div className="kpi-foot">{foot}</div>
          </div>
        ))}
      </div>

      {/* Address */}
      {data?.address && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)' }}>
              Connected Address
            </div>
            <div className="mono" style={{ fontSize: '0.9rem', marginTop: 4 }}>{data.address}</div>
          </div>
          <button
            className="button secondary"
            style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: '0.82rem' }}
            onClick={() => navigator.clipboard?.writeText(data.address)}
          >Copy</button>
        </div>
      )}

      {/* Tabs */}
      <div className="portal-tabs">
        {(['balances', 'transactions', 'staking'] as const).map(t => (
          <button key={t} className={`portal-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Balances */}
      {tab === 'balances' && (
        <div className="portal-section">
          <div className="portal-section-title">Token Balances</div>
          {balances.length === 0 ? (
            <div className="card" style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>No balances found</div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              {balances.map((b) => (
                <div key={b.symbol + b.layer} className="info-row" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontWeight: 700 }}>{b.symbol}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{b.name} · {b.layer}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700 }}>{b.balance} {b.symbol}</div>
                    <div style={{ fontSize: '0.82rem', color: b.change24h >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {b.usdValue} ({b.change24h > 0 ? '+' : ''}{b.change24h.toFixed(2)}%)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/bridge"><button className="button" style={{ fontSize: '0.88rem', padding: '10px 18px' }}>Bridge GST</button></Link>
            <Link href="/wallet/send"><button className="button secondary" style={{ fontSize: '0.88rem', padding: '10px 18px' }}>Send</button></Link>
            <Link href="/wallet/receive"><button className="button secondary" style={{ fontSize: '0.88rem', padding: '10px 18px' }}>Receive</button></Link>
          </div>
        </div>
      )}

      {/* Transactions */}
      {tab === 'transactions' && (
        <div className="portal-section">
          <div className="portal-section-title">Transaction History</div>
          {txs.length === 0 ? (
            <div className="card" style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>No transactions yet</div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th><th>Hash</th><th>Amount</th><th>Layer</th><th>Status</th><th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx) => (
                      <tr key={tx.hash}>
                        <td style={{ color: TYPE_COLOR[tx.type], fontWeight: 600, fontSize: '0.82rem' }}>
                          {TYPE_LABEL[tx.type] ?? tx.type}
                        </td>
                        <td className="mono" style={{ fontSize: '0.8rem' }}>
                          <Link href={`/explorer/tx/${tx.hash}`} style={{ color: 'var(--accent-3)' }}>
                            {short(tx.hash)}
                          </Link>
                        </td>
                        <td>{tx.amount} {tx.symbol}</td>
                        <td><span className="badge">{tx.layer}</span></td>
                        <td>
                          <span className={`status-tag ${tx.status === 'confirmed' ? 'resolved' : tx.status === 'pending' ? 'pending' : 'open'}`}>
                            {tx.status}
                          </span>
                        </td>
                        <td style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{tx.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Staking */}
      {tab === 'staking' && (
        <div className="portal-section">
          <div className="portal-section-title">GST Staking</div>
          <div className="data-grid">
            {[
              { label: 'Staked Balance', value: data?.stakedGst ?? '—', desc: 'Earning epoch rewards' },
              { label: 'Pending Rewards', value: data?.pendingRewards ?? '—', desc: 'Available to claim' },
              { label: 'APY Estimate', value: '~12.4%', desc: 'Based on last 7 epochs' },
              { label: 'Unbonding Period', value: '21 days', desc: 'After unstake request' },
            ].map(({ label, value, desc }) => (
              <div key={label} className="data-card">
                <div className="kpi-label">{label}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{value}</div>
                <div className="muted">{desc}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="button" style={{ fontSize: '0.88rem', padding: '10px 18px' }}>Stake GST</button>
            <button className="button secondary" style={{ fontSize: '0.88rem', padding: '10px 18px' }}>Claim Rewards</button>
            <button className="button secondary" style={{ fontSize: '0.88rem', padding: '10px 18px' }}>Unstake</button>
          </div>
        </div>
      )}
    </div>
  );
}
