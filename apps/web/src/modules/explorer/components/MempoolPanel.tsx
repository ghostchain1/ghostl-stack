'use client';

import { useEffect, useState } from 'react';
import { ExplorerSummarySchema, type ExplorerSummary } from '@ghostchain/contract-schemas';
import { resolveApiBase } from '../../../lib/runtime';
import { apiRequest, formatApiError, type ApiError } from '../../../lib/api';

type MempoolInfo = {
  pending: number;
  queued: number;
  fairnessScore?: number;
  mevRisk?: string;
};

const API_BASE = resolveApiBase();

type MempoolPanelProps = {
  chain?: string;
  mempool?: MempoolInfo;
};

export function MempoolPanel({ chain = 'l2', mempool }: MempoolPanelProps) {
  const [info, setInfo] = useState<MempoolInfo>(mempool || { pending: 0, queued: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<ExplorerSummary>(`/explorer?chain=${chain}&blockLimit=0&txLimit=0`, {
        baseUrl: API_BASE,
        schema: ExplorerSummarySchema
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo(res.data.mempool);
      setError(null);
    } catch {
      setError({
        message: 'mempool_fetch_failed',
        endpoint: `${API_BASE}/explorer?chain=${chain}`,
        method: 'GET'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mempool) {
      setInfo(mempool);
      setError(null);
      setLoading(false);
      return;
    }
    load().catch(() => undefined);
  }, [chain, mempool]);

  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        Mempool & MEV <span className="muted">({chain.toUpperCase()})</span>
      </div>
      {loading && <div className="muted">Loading…</div>}
      {error && (
        <div className="muted">
          {(() => {
            const info = formatApiError(error);
            return `${info.method} ${info.endpoint} | ${info.status} | ${info.hint}`;
          })()}
        </div>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <div className="pill">Pending: {info.pending}</div>
        <div className="pill">Queued: {info.queued}</div>
        <div className="pill">Fairness score: {info.fairnessScore ?? '—'}</div>
        <div className="pill">MEV risk: {info.mevRisk || 'low'}</div>
        <button onClick={load} style={{ width: '100%' }}>
          Refresh
        </button>
      </div>
    </div>
  );
}
