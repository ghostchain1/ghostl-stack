'use client';

import { useEffect, useState } from 'react';

type Metrics = {
  missedBlocks: number;
  finalityLag: number;
  participationRate?: number;
  lastProposer?: string;
  proposerRotation?: { proposer: string; at: string }[];
  bftAlerts?: { message: string; severity: string; time: string }[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function ValidatorMetrics() {
  const [metrics, setMetrics] = useState<Metrics>({ missedBlocks: 0, finalityLag: 0 });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/api/validators/metrics`, { credentials: 'include' });
      const json = await res.json();
      setMetrics(json.metrics || { missedBlocks: 0, finalityLag: 0 });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Validator metrics</div>
      {loading && <div className="muted">Loading...</div>}
      <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>Missed blocks</div>
          <div className={metrics.missedBlocks > 0 ? 'badge warn' : 'badge ok'}>{metrics.missedBlocks}</div>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>Finality lag</div>
          <div className={metrics.finalityLag > 0 ? 'badge warn' : 'badge ok'}>{metrics.finalityLag}</div>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>Participation</div>
          <div className={metrics.participationRate && metrics.participationRate < 0.95 ? 'badge warn' : 'badge ok'}>
            {(metrics.participationRate ?? 0).toFixed(2)}
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>Last proposer</div>
          <div className="badge">{metrics.lastProposer || 'unknown'}</div>
        </div>
        {metrics.proposerRotation && metrics.proposerRotation.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            <div className="muted">Recent proposer rotation</div>
            {metrics.proposerRotation.slice(-5).map((p) => (
              <div key={`${p.proposer}-${p.at}`} className="pill">
                {p.proposer} · {new Date(p.at).toLocaleTimeString()}
              </div>
            ))}
          </div>
        )}
        {metrics.bftAlerts && metrics.bftAlerts.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            <div className="muted">BFT / equivocation alerts</div>
            {metrics.bftAlerts.slice(0, 3).map((a) => (
              <div key={`${a.message}-${a.time}`} className={`pill ${a.severity === 'critical' ? 'bad' : 'warn'}`}>
                {a.message} · {new Date(a.time).toLocaleString()}
              </div>
            ))}
          </div>
        )}
        <button onClick={load} style={{ width: '100%' }}>
          Refresh
        </button>
      </div>
    </div>
  );
}
