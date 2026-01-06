'use client';

import type { Validator } from '@ghostl/types/validators';

export function VotingPowerChart({ validators }: { validators: Validator[] }) {
  const total = validators.reduce((sum, v) => sum + v.power, 0);
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Voting power distribution</div>
      <div className="stack" style={{ gap: 6 }}>
        {validators.map((v) => {
          const pct = total ? ((v.power / total) * 100).toFixed(1) : '0';
          return (
            <div key={v.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div>{v.id}</div>
                <div className="muted">{v.power} power</div>
              </div>
              <div className="pill">{pct}%</div>
            </div>
          );
        })}
        {!validators.length && <div className="muted">No validators.</div>}
      </div>
    </div>
  );
}
