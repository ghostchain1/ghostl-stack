'use client';

import { useEffect, useState } from 'react';

type MempoolInfo = {
  pending: number;
  queued: number;
  fairnessScore?: number;
  mevRisk?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function MempoolPanel({ chain = 'l2' }: { chain?: string }) {
  const [info, setInfo] = useState<MempoolInfo>({ pending: 0, queued: 0 });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/explorer/mempool?chain=${chain}`, { credentials: 'include' });
      const json = await res.json();
      setInfo(json);
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
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        Mempool & MEV <span className="muted">({chain.toUpperCase()})</span>
      </div>
      {loading && <div className="muted">Loading…</div>}
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
