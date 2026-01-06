'use client';

import type { TreasuryTx } from '@ghostl/types/tokenomics';

type TreasuryBalance = { native?: string; token?: string; chain?: string };

export function TreasuryOverview({ balance, recent }: { balance: TreasuryBalance; recent: TreasuryTx[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Treasury</div>
      <div className="pill">
        {balance.chain ? `${balance.chain}: ` : ''}
        {balance.native ?? '?'} {balance.token ? `· ${balance.token}` : ''}
      </div>
      <div className="stack" style={{ gap: 6, marginTop: 8 }}>
        {recent.map((tx) => (
          <div key={tx.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{tx.purpose}</div>
              <div className="muted mono">{tx.to}</div>
            </div>
            <div className="badge">{tx.amount}</div>
          </div>
        ))}
        {!recent.length && <div className="muted">No recent treasury txs.</div>}
      </div>
    </div>
  );
}
