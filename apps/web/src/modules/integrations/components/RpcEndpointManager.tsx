'use client';

import type { RpcEndpoint } from '@ghostl/types/integrations';

export function RpcEndpointManager({ endpoints }: { endpoints: RpcEndpoint[] }) {
  const tone = (status: RpcEndpoint['status']) => {
    if (status === 'healthy') return 'ok';
    if (status === 'degraded') return 'warn';
    return 'bad';
  };
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>RPC endpoints</div>
      <div className="stack" style={{ gap: 6 }}>
        {endpoints.map((e) => (
          <div key={e.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{e.id}</div>
              <div className="muted">
                {e.url} · {e.type} {e.region ? `· ${e.region}` : ''}
              </div>
            </div>
            <div className={`badge ${tone(e.status)}`}>{e.status}</div>
          </div>
        ))}
        {!endpoints.length && <div className="muted">No endpoints configured.</div>}
      </div>
    </div>
  );
}
