'use client';

import type { Tx } from '@ghostchain/types/explorer';

export function MempoolStream({ txs }: { txs: Tx[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Mempool (live)</div>
      <div className="stack" style={{ gap: 6, maxHeight: 240, overflow: 'auto' }}>
        {txs.map((t) => (
          <div key={t.hash} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="mono">{t.hash.slice(0, 10)}…</div>
            <div className="muted">{t.from.slice(0, 8)} → {t.to?.slice(0, 8) || 'contract'}</div>
            <div className="badge secondary">{t.gas} gas</div>
          </div>
        ))}
        {!txs.length && <div className="muted">No pending txs.</div>}
      </div>
    </div>
  );
}
