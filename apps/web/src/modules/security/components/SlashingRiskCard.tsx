'use client';

import type { RiskSignal } from '@ghostl/types/security';

export function SlashingRiskCard({ signals }: { signals: RiskSignal[] }) {
  const highRisk = signals.filter((s) => ['high', 'critical'].includes(s.severity));
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Slashing risk</div>
          <div className="muted">Validator liveness, equivocation, penalties</div>
        </div>
        <div className={`badge ${highRisk.length ? 'warn' : 'ok'}`}>{highRisk.length ? 'Risk' : 'Nominal'}</div>
      </div>
      <div className="stack" style={{ marginTop: 8 }}>
        {signals.map((s) => (
          <div key={s.source + s.evidence} className="row" style={{ justifyContent: 'space-between' }}>
            <div className="muted">{s.source}</div>
            <div className="badge">{s.score}</div>
          </div>
        ))}
        {!signals.length && <div className="muted">No slashing alerts.</div>}
      </div>
    </div>
  );
}
