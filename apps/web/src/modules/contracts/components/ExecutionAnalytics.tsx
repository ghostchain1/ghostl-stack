'use client';

import type { ContractCallStats } from '@ghostl/types/contracts';

export function ExecutionAnalytics({ stats }: { stats: ContractCallStats }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Execution analytics</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div className="pill">Calls {stats.calls}</div>
        <div className="pill">Avg gas {stats.avgGas}</div>
        <div className="pill">Reverts {stats.reverts}</div>
        <div className="pill">{stats.timeRange}</div>
      </div>
    </div>
  );
}
