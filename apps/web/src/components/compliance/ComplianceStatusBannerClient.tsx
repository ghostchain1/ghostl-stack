'use client';

import { useEffect, useState } from 'react';
import { resolveComplianceBase } from '../../lib/runtime';

type ComplianceStatus = {
  ok?: boolean;
  status?: string;
  service?: string;
};

export function ComplianceStatusBannerClient() {
  const [status, setStatus] = useState<ComplianceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const baseUrl = resolveComplianceBase();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${baseUrl}/health`, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setError(`HTTP ${res.status}`);
          return;
        }
        const payload = (await res.json()) as ComplianceStatus;
        if (payload && payload.ok === false) {
          if (!cancelled) setError(payload.status || 'unhealthy');
        } else if (!cancelled) {
          setStatus(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'unreachable');
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const healthy = !error;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Compliance API status</div>
          <div className="muted">{baseUrl}</div>
        </div>
        <div className={`badge ${healthy ? 'ok' : 'bad'}`}>{healthy ? 'healthy' : 'down'}</div>
      </div>
      {!healthy && <div className="muted" style={{ marginTop: 8 }}>Error: {error}</div>}
      {healthy && status?.status && <div className="muted" style={{ marginTop: 8 }}>Status: {status.status}</div>}
    </div>
  );
}
