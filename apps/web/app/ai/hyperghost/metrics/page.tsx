'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function HyperghostMetricsPage() {
  const [text, setText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/hyperghost/metrics', { cache: 'no-store' });
        if (!res.ok) {
          setError(`metrics_failed status=${res.status}`);
          return;
        }
        setError(null);
        setText(await res.text());
      } catch (e) {
        setError(String(e));
      }
    };
    load().catch(() => undefined);
  }, []);

  return (
    <div className="content">
      <div className="spread" style={{ alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Metrics</div>
          <div className="muted">Prometheus text format from hyper-ghost-supervisor</div>
        </div>
        <div className="inline-form" style={{ gap: 8 }}>
          <Link className="button secondary" href="/ai/hyperghost">
            Overview
          </Link>
          <a className="button secondary" href="/api/hyperghost/metrics" target="_blank" rel="noreferrer">
            Open Raw
          </a>
        </div>
      </div>

      <div className="card">
        {error && <div className="muted">Error: {error}</div>}
        {!error && !text && <div className="muted">Loading...</div>}
        {!!text && <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{text}</pre>}
      </div>
    </div>
  );
}

