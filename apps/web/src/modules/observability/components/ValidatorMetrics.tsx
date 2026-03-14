'use client';

import { useEffect, useState } from 'react';
import { resolveApiBase } from '../../../lib/runtime';
import { apiRequest, type ApiError } from '../../../lib/api';
import { DataFetchErrorCard } from '../../../components/DataFetchErrorCard';

type Metrics = {
  missedBlocks: number;
  finalityLag: number;
  participationRate?: number;
  lastProposer?: string;
  proposerRotation?: { proposer: string; at: string }[];
  proposerSummary?: { proposer: string; count: number }[];
  bftAlerts?: { message: string; severity: string; time: string }[];
};

const API_BASE = resolveApiBase();

export function ValidatorMetrics() {
  const [metrics, setMetrics] = useState<Metrics>({ missedBlocks: 0, finalityLag: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ metrics?: Metrics }>('/v1/api/validators/metrics', { baseUrl: API_BASE });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMetrics(res.data.metrics || { missedBlocks: 0, finalityLag: 0 });
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'validator_metrics_fetch_failed',
        endpoint: `${API_BASE}/v1/api/validators/metrics`,
        method: 'GET'
      });
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
      {error && <DataFetchErrorCard title="Validator metrics" error={error} />}
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
        {metrics.proposerSummary && metrics.proposerSummary.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            <div className="muted">Rotation heatmap (last hour)</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {metrics.proposerSummary.map((p) => (
                <div
                  key={p.proposer}
                  className="pill"
                  style={{
                    background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent) ' + Math.min(p.count * 10, 100) + '%, rgba(255,255,255,0.1) ' + Math.min(p.count * 10, 100) + '%)'
                  }}
                >
                  {p.proposer}: {p.count}
                </div>
              ))}
            </div>
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
