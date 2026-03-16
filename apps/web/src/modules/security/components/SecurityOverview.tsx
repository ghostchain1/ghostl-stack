'use client';

import type { RiskSignal } from '@ghostchain/types/security';

export function SecurityOverview({ score, signals }: { score: number; signals: RiskSignal[] }) {
  const severityColor = (severity: RiskSignal['severity']) => {
    if (severity === 'critical') return 'bad';
    if (severity === 'high') return 'warn';
    return 'ok';
  };
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Security posture</div>
          <div className="muted">Risk score aggregated from guard/relayer/validators</div>
        </div>
        <div className="badge">{score.toFixed(1)}</div>
      </div>
      <div className="stack" style={{ marginTop: 10 }}>
        {signals.slice(0, 4).map((s) => (
          <div key={`${s.source}-${s.createdAt || s.evidence}`} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{s.source}</div>
              <div className="muted">{s.evidence}</div>
            </div>
            <div className={`badge ${severityColor(s.severity)}`}>{s.severity}</div>
          </div>
        ))}
        {!signals.length && <div className="muted">No risk signals reported.</div>}
      </div>
    </div>
  );
}
