'use client';

import type { ReorgEvent } from '@ghostchain/types/chain';

export function ForkReorgMonitor({ events }: { events: ReorgEvent[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Fork / Reorg monitor</div>
      <div className="stack" style={{ gap: 6 }}>
        {events.map((e, idx) => (
          <div key={`${e.time}-${idx}`} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="muted">
                Depth {e.depth} from {e.fromBlock} → {e.toBlock}
              </div>
              <div className="muted">{e.time}</div>
            </div>
            <div className={`badge ${e.depth > 1 ? 'warn' : 'ok'}`}>{e.depth > 1 ? 'Reorg' : 'Minor'}</div>
          </div>
        ))}
        {!events.length && <div className="muted">No reorgs detected.</div>}
      </div>
    </div>
  );
}
