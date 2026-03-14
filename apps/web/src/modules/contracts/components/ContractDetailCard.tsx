'use client';

import type { Contract, ContractCallStats } from '@ghostl/types/contracts';

export function ContractDetailCard({ contract, stats }: { contract: Contract; stats?: ContractCallStats }) {
  return (
    <div className="card">
      <div
        className="row"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, wordBreak: 'break-word' }}>{contract.name || contract.address.slice(0, 10)}</div>
          <div className="mono" style={{ overflowWrap: 'anywhere' }}>{contract.address}</div>
        </div>
        <div className={`badge ${contract.verified ? 'ok' : 'warn'}`} style={{ whiteSpace: 'nowrap' }}>
          {contract.verified ? 'Verified' : 'Unverified'}
        </div>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        Proxy: {contract.proxyType || 'none'} · Owner: {contract.owner || '—'}
      </div>
      {stats ? (
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <div className="pill">Calls {stats.calls}</div>
          <div className="pill">Avg gas {stats.avgGas}</div>
          <div className="pill">Reverts {stats.reverts}</div>
          <div className="pill">{stats.timeRange}</div>
        </div>
      ) : (
        <div className="muted" style={{ marginTop: 6 }}>
          No analytics yet.
        </div>
      )}
    </div>
  );
}
