'use client';

import type { TreasuryTx } from '@ghostchain/types/tokenomics';

export function PayoutsPanel({ payouts }: { payouts: TreasuryTx[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Payouts & distributions</div>
      <div className="stack" style={{ gap: 6 }}>
        {payouts.map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{p.purpose}</div>
              <div className="muted mono">{p.to}</div>
            </div>
            <div className="badge">{p.amount}</div>
          </div>
        ))}
        {!payouts.length && <div className="muted">No payouts.</div>}
      </div>
    </div>
  );
}
