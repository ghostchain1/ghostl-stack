'use client';

import type { ChainInfo, EpochInfo } from '@ghostchain/types/chain';

export function ChainOverviewCard({
  chain,
  epoch,
  blockTimeMs,
  finalizedHeight
}: {
  chain: ChainInfo;
  epoch?: EpochInfo;
  blockTimeMs?: number;
  finalizedHeight?: number;
}) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800 }}>{chain.name}</div>
          <div className="muted">
            {chain.env} · {chain.consensus} · chainId {chain.chainId}
          </div>
        </div>
        <div className="badge">Finalized {finalizedHeight ?? '—'}</div>
      </div>
      <div className="row" style={{ gap: 12, marginTop: 8 }}>
        <div className="pill">Block time: {blockTimeMs ? `${blockTimeMs} ms` : '?'}</div>
        {epoch && (
          <div className="pill">
            Epoch {epoch.epoch} · Round {epoch.round}
          </div>
        )}
      </div>
    </div>
  );
}
