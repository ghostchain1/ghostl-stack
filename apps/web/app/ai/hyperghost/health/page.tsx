'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ApiError } from '../../../../src/lib/api';
import { DataFetchErrorCard } from '../../../../src/components/DataFetchErrorCard';
import { hgopRequest } from '../../../../src/modules/hyperghost/hgopApi';

export default function HyperghostHealthPage() {
  const [health, setHealth] = useState<unknown | null>(null);
  const [status, setStatus] = useState<unknown | null>(null);
  const [errors, setErrors] = useState<Array<{ title: string; error: ApiError }>>([]);

  useEffect(() => {
    const load = async () => {
      const nextErrors: Array<{ title: string; error: ApiError }> = [];
      const healthRes = await hgopRequest('/health');
      if (!healthRes.ok) nextErrors.push({ title: 'HGOP health', error: healthRes.error });
      else setHealth(healthRes.data);

      const statusRes = await hgopRequest('/status');
      if (!statusRes.ok) nextErrors.push({ title: 'HGOP status', error: statusRes.error });
      else setStatus(statusRes.data);

      setErrors(nextErrors);
    };
    load().catch(() => undefined);
  }, []);

  return (
    <div className="content">
      <div className="spread" style={{ alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Supervisor Health</div>
          <div className="muted">/health and /status</div>
        </div>
        <div className="inline-form" style={{ gap: 8 }}>
          <Link className="button secondary" href="/ai/hyperghost">
            Overview
          </Link>
          <Link className="button secondary" href="/ai/hyperghost/incidents">
            Incidents
          </Link>
          <Link className="button secondary" href="/ai/hyperghost/proposals">
            Proposals
          </Link>
        </div>
      </div>

      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>/health</div>
          {!health ? (
            <div className="muted">Loading...</div>
          ) : (
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(health, null, 2)}</pre>
          )}
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>/status</div>
          {!status ? (
            <div className="muted">Loading...</div>
          ) : (
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(status, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

