'use client';

import type { RpcEndpoint } from '@ghostl/types/integrations';
import { useMemo, useState } from 'react';

export function RpcEndpointManager({ endpoints }: { endpoints: RpcEndpoint[] }) {
  const [layerFilter, setLayerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const layers = useMemo(
    () => Array.from(new Set(endpoints.map((e) => e.layer).filter(Boolean))) as string[],
    [endpoints]
  );
  const filtered = endpoints.filter((endpoint) => {
    if (layerFilter && endpoint.layer !== layerFilter) return false;
    if (statusFilter && endpoint.status !== statusFilter) return false;
    return true;
  });
  const wsEndpoints = endpoints.filter((endpoint) => endpoint.protocol === 'ws' || endpoint.url.startsWith('ws'));
  const tone = (status: RpcEndpoint['status']) => {
    if (status === 'healthy') return 'ok';
    if (status === 'degraded') return 'warn';
    return 'bad';
  };
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>RPC endpoints</div>
      <div className="row" style={{ marginBottom: 8 }}>
        <select className="input" value={layerFilter} onChange={(e) => setLayerFilter(e.target.value)}>
          <option value="">All layers</option>
          {layers.map((layer) => (
            <option key={layer} value={layer}>
              {layer}
            </option>
          ))}
        </select>
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="healthy">healthy</option>
          <option value="degraded">degraded</option>
          <option value="down">down</option>
        </select>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {filtered.map((e) => (
          <div key={e.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{e.chainName || e.id}</div>
              <div className="muted">
                {e.url} · {e.type}
                {e.protocol ? `/${e.protocol}` : ''}
                {e.region ? ` · ${e.region}` : ''}
                {typeof e.priority === 'number' ? ` · p${e.priority}` : ''}
              </div>
              {e.chainId && <div className="muted">Chain ID {e.chainId}</div>}
              {e.chainType && <div className="muted">Type {e.chainType}</div>}
              {e.network && <div className="muted">Network {e.network}</div>}
              {typeof e.latencyMs === 'number' && <div className="muted">Latency {e.latencyMs} ms</div>}
              {typeof e.peerCount === 'number' && <div className="muted">Peers {e.peerCount}</div>}
              {typeof e.syncing === 'boolean' && <div className="muted">Syncing {e.syncing ? 'yes' : 'no'}</div>}
              {e.clientVersion && <div className="muted">Client {e.clientVersion}</div>}
              {e.wsError && <div className="muted">WS error {e.wsError}</div>}
              {e.features && Object.keys(e.features).length > 0 && (
                <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {Object.entries(e.features).map(([key, value]) => (
                    <span key={key} className={`chip ${value ? 'ok' : 'warn'}`}>
                      {key}: {value ? 'on' : 'off'}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className={`badge ${tone(e.status)}`}>{e.status}</div>
          </div>
        ))}
        {!filtered.length && <div className="muted">No endpoints configured.</div>}
      </div>

      <div style={{ fontWeight: 700, margin: '18px 0 6px' }}>WS endpoints</div>
      <div className="stack" style={{ gap: 6 }}>
        {wsEndpoints.map((e) => (
          <div key={e.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{e.chainName || e.id}</div>
              <div className="muted">
                {e.url} · {e.type}
                {e.region ? ` · ${e.region}` : ''}
                {typeof e.priority === 'number' ? ` · p${e.priority}` : ''}
              </div>
              {e.chainId && <div className="muted">Chain ID {e.chainId}</div>}
              {typeof e.latencyMs === 'number' && <div className="muted">Latency {e.latencyMs} ms</div>}
              {e.wsError && <div className="muted">WS error {e.wsError}</div>}
            </div>
            <div className={`badge ${tone(e.status)}`}>{e.status}</div>
          </div>
        ))}
        {!wsEndpoints.length && <div className="muted">No WS endpoints configured.</div>}
      </div>
    </div>
  );
}
