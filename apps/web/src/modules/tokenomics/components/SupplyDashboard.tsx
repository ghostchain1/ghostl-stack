'use client';

import type { SupplySnapshot } from '@ghostchain/types/tokenomics';

export function SupplyDashboard({ snapshots }: { snapshots: SupplySnapshot[] }) {
  const latest = snapshots[0];
  return (
    <div className="card">
      <div style={{ fontWeight: 800, marginBottom: 6 }}>Supply</div>
      {latest ? (
        <div className="stack" style={{ gap: 6 }}>
          <div className="pill">Total: {latest.total}</div>
          <div className="pill">Circulating: {latest.circulating}</div>
          <div className="pill">Minted: {latest.minted}</div>
          <div className="pill">Burned: {latest.burned}</div>
          <div className="muted">Updated: {latest.time}</div>
        </div>
      ) : (
        <div className="muted">No supply data.</div>
      )}
    </div>
  );
}
