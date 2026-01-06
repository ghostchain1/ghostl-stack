'use client';

import type { KeyRef } from '@ghostl/types/security';

export function KeyRotationPanel({ keys }: { keys: KeyRef[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Validator keys</div>
      <div className="stack" style={{ gap: 8 }}>
        {keys.map((k) => (
          <div key={`${k.validatorId}-${k.type}`} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{k.validatorId}</div>
              <div className="muted">
                {k.type} · rotated {k.rotatedAt || '—'} · expires {k.expiresAt || '—'}
              </div>
            </div>
            <div className="badge secondary">Rotate</div>
          </div>
        ))}
        {!keys.length && <div className="muted">No key metadata found.</div>}
      </div>
    </div>
  );
}
