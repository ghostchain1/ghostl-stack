'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { hgopRequest } from '../../../../src/modules/hyperghost/hgopApi';

type GhostDnsStatus = {
  ok: boolean;
  health?: { ok: boolean; named_running?: boolean; mode?: string; domain?: string };
  zone?: { ok: boolean; zone?: string };
  pendingApprovals?: number;
  error?: string;
};

export default function HyperghostGhostDnsPage() {
  const [status, setStatus] = useState<GhostDnsStatus | null>(null);
  const [error, setError] = useState<string>('');

  const load = async () => {
    const res = await hgopRequest<GhostDnsStatus>('/ghostdns/status');
    if (!res.ok) {
      setError(String(res.error?.message || res.error || 'request_failed'));
      return;
    }
    setError('');
    setStatus(res.data);
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const invoke = async (path: string) => {
    const res = await hgopRequest(path, { init: { method: 'POST' } });
    if (!res.ok) setError(String(res.error?.message || res.error || 'action_failed'));
    await load();
  };

  return (
    <div className="content">
      <div className="spread" style={{ alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>GhostDNS Control</div>
          <div className="muted">HGOP-integrated DNS automation and incidents</div>
        </div>
        <div className="inline-form" style={{ gap: 8 }}>
          <Link className="button secondary" href="/ai/hyperghost">
            Overview
          </Link>
          <button className="button secondary" onClick={() => invoke('/ghostdns/reconcile')}>
            Reconcile
          </button>
          <button className="button secondary" onClick={() => invoke('/ghostdns/safe-reload')}>
            Safe reload
          </button>
          <button className="button secondary" onClick={() => invoke('/ghostdns/detectors/run')}>
            Run detectors
          </button>
        </div>
      </div>

      <div className="card-grid">
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Status</div>
          {!status ? <div className="muted">Loading...</div> : <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(status.health, null, 2)}</pre>}
        </div>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Pending approvals</div>
          <strong>{status?.pendingApprovals ?? 0}</strong>
        </div>
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Zone preview</div>
          {error ? <div className="muted">Error: {error}</div> : <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{status?.zone?.zone || 'No zone loaded'}</pre>}
        </div>
      </div>
    </div>
  );
}
