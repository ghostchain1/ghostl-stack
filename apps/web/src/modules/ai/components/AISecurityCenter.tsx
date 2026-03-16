'use client';

import type { Anomaly } from '@ghostchain/types/ai';

export function AISecurityCenter({ anomalies }: { anomalies: Anomaly[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 800, marginBottom: 6 }}>AI Security Center</div>
      <div className="stack" style={{ gap: 6 }}>
        {anomalies.map((a) => (
          <div key={a.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{a.entity}</div>
              <div className="muted">{a.reasons.join('; ')}</div>
            </div>
            <div className={`badge ${a.score >= 80 ? 'bad' : a.score >= 50 ? 'warn' : 'ok'}`}>{a.score}</div>
          </div>
        ))}
        {!anomalies.length && <div className="muted">No anomalies detected.</div>}
      </div>
    </div>
  );
}
