'use client';

import { useEffect, useState } from 'react';
import { Card, Badge } from '@ghostchain/ui';
import type { ApiError } from '../../src/lib/api';
import { DataFetchErrorCard } from '../../src/components/DataFetchErrorCard';

type ServiceStatus = {
  id: string;
  name: string;
  url: string;
  ok: boolean;
  status?: string;
  error?: string;
  httpStatus?: number;
  latencyMs?: number;
};

type ChainStatus = {
  key: 'l1' | 'l2' | 'l3';
  rpc: string;
  ok: boolean;
  chainId?: string;
  blockNumber?: string;
  error?: string;
  latencyMs?: number;
};

type StatusResponse = {
  generatedAt: string;
  services: ServiceStatus[];
  chains: ChainStatus[];
};

const formatHexNumber = (value?: string) => {
  if (!value) return 'n/a';
  if (!value.startsWith('0x')) return value;
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? `${value} (${parsed})` : value;
};

const badgeTone = (ok?: boolean) => (ok ? 'default' : 'critical');

export default function ConnectionStatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) {
            setError({
              message: 'status_endpoint_failed',
              status: res.status,
              endpoint: '/api/status',
              method: 'GET'
            });
          }
          return;
        }
        const payload = (await res.json()) as StatusResponse;
        if (!cancelled) {
          setData(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError({
            message: err instanceof Error ? err.message : 'status_endpoint_failed',
            endpoint: '/api/status',
            method: 'GET'
          });
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="content">
      <h1>Connection Status</h1>
      <p className="muted">Live service and chain connectivity snapshot for GhostChain, GhostL2, and GhostL3.</p>
      {error && (
        <div className="card-grid" style={{ marginBottom: 16 }}>
          <DataFetchErrorCard title="Status API" error={error} />
        </div>
      )}
      <div className="card-grid">
        <Card title="Services" subtitle={data?.generatedAt ? `Generated ${data.generatedAt}` : 'Waiting for status'}>
          <div className="stack">
            {(data?.services || []).map((service) => (
              <div key={service.id} className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{service.name}</strong>
                  <div className="muted">{service.url}</div>
                  {service.error && <div className="muted">Error: {service.error}</div>}
                </div>
                <div className="stack" style={{ alignItems: 'flex-end' }}>
                  <Badge tone={badgeTone(service.ok)}>{service.ok ? 'healthy' : 'down'}</Badge>
                  {typeof service.latencyMs === 'number' && <div className="muted">{service.latencyMs} ms</div>}
                  {service.httpStatus && <div className="muted">HTTP {service.httpStatus}</div>}
                </div>
              </div>
            ))}
            {!data?.services?.length && <div className="muted">No service data yet.</div>}
          </div>
        </Card>
        <Card title="Chains" subtitle="RPC connectivity">
          <div className="stack">
            {(data?.chains || []).map((chain) => (
              <div key={chain.key} className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{chain.key.toUpperCase()}</strong>
                  <div className="muted">{chain.rpc}</div>
                  {chain.error && <div className="muted">Error: {chain.error}</div>}
                </div>
                <div className="stack" style={{ alignItems: 'flex-end' }}>
                  <Badge tone={badgeTone(chain.ok)}>{chain.ok ? 'ok' : 'down'}</Badge>
                  <div className="muted">Chain ID: {formatHexNumber(chain.chainId)}</div>
                  <div className="muted">Head: {formatHexNumber(chain.blockNumber)}</div>
                  {typeof chain.latencyMs === 'number' && <div className="muted">{chain.latencyMs} ms</div>}
                </div>
              </div>
            ))}
            {!data?.chains?.length && <div className="muted">No chain data yet.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
