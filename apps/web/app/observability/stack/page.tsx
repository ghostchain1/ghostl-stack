'use client';

import { useEffect, useState } from 'react';
import { Card, Badge } from '@ghostl/ui';
import { ChainOverviewSchema, type ChainOverview } from '@ghostl/contract-schemas';
import { resolveApiBase } from '../../../src/lib/runtime';
import { apiRequest, type ApiError } from '../../../src/lib/api';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';

const API_URL = resolveApiBase();

type Overview = {
  chain: string;
  head?: number;
  finalized?: number;
  lag?: number;
  relayer?: { finalized?: number; errors?: number };
  guard?: { alerts?: number; deposits?: number; activeAlerts?: Record<string, unknown>[] };
};

export default function StackPage() {
  const [chain, setChain] = useState<'l2' | 'l3'>('l2');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const fallback: Overview = { chain };

  const load = async (target: 'l2' | 'l3') => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<ChainOverview>('/chain', {
        baseUrl: API_URL,
        init: { cache: 'no-cache' },
        schema: ChainOverviewSchema
      });
      if (!res.ok) {
        setError(res.error);
        setData(null);
        return;
      }
      const snapshot = res.data.chains.find((entry) => entry.id === target);
      if (!snapshot) {
        setError({
          message: 'chain_missing',
          endpoint: `${API_URL}/chain`,
          method: 'GET',
          hint: 'Ghost-api /chain did not return this chain.'
        });
        setData(fallback);
        return;
      }
      if (!snapshot.telemetry?.health) {
        setError({
          message: 'telemetry_unavailable',
          endpoint: `${API_URL}/chain`,
          method: 'GET',
          hint: 'Telemetry is only available when the chain telemetry service is running.'
        });
        setData({ chain: target });
        return;
      }
      const health = snapshot.telemetry.health;
      const lag = snapshot.finalityLag ?? health.chain.head - health.chain.finalized;
      setData({
        chain: target,
        head: health.chain.head,
        finalized: health.chain.finalized,
        lag: Number.isFinite(lag) ? lag : undefined,
        relayer: { finalized: health.relayer.finalized, errors: health.relayer.errors },
        guard: { alerts: health.guard.alerts, deposits: health.guard.deposits, activeAlerts: [] }
      });
    } catch {
      setError({
        message: 'stack_fetch_failed',
        endpoint: `${API_URL}/chain`,
        method: 'GET'
      });
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(chain);
  }, [chain]);

  return (
    <div className="content">
      <div className="inline-form" style={{ marginBottom: 12, gap: 12 }}>
        <span className="muted">Chain</span>
        <select className="select" value={chain} onChange={(e) => setChain(e.target.value as 'l2' | 'l3')}>
          <option value="l2">L2</option>
          <option value="l3">L3</option>
        </select>
        {loading && <span className="muted">Loading...</span>}
      </div>
      <div className="card-grid">
        {error && <DataFetchErrorCard title="Stack overview" error={error} />}
        <Card title={`Head / Finalized (${chain})`} subtitle="op-gate">
          <div className="stack">
            <div className="spread">
              <span className="muted">Head</span>
              <span>{data?.head ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Finalized</span>
              <span>{data?.finalized ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Lag</span>
              <Badge tone={typeof data?.lag === 'number' && data.lag > 5 ? 'warning' : 'default'}>
                {data?.lag ?? 'n/a'}
              </Badge>
            </div>
          </div>
        </Card>
        <Card title="Relayer" subtitle="health + totals">
          <div className="stack">
            <div className="spread">
              <span className="muted">Finalized batches</span>
              <span>{data?.relayer?.finalized ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Errors</span>
              <Badge tone={data?.relayer?.errors ? 'critical' : 'default'}>{data?.relayer?.errors ?? 'n/a'}</Badge>
            </div>
            <div className="muted">Health: {data?.relayer ? 'ok' : 'n/a'}</div>
          </div>
        </Card>
        <Card title="Guard" subtitle="alerts/deposits">
          <div className="stack">
            <div className="spread">
              <span className="muted">Deposits seen</span>
              <span>{data?.guard?.deposits ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Alerts total</span>
              <Badge tone={data?.guard?.alerts ? 'critical' : 'default'}>{data?.guard?.alerts ?? 'n/a'}</Badge>
            </div>
            <div className="stack">
              <span className="muted">Active alerts</span>
              {(data?.guard?.activeAlerts || []).slice(0, 3).map((a: Record<string, unknown>, idx) => {
                const reasons = Array.isArray(a.reasons) ? (a.reasons as string[]).join(', ') : undefined;
                const label = reasons || (a.tx as string | undefined) || (a.from as string | undefined) || 'alert';
                return (
                  <div key={idx} className="muted" style={{ fontSize: '0.85rem' }}>
                    {label}
                  </div>
                );
              })}
              {(data?.guard?.activeAlerts?.length || 0) === 0 && <span className="muted">None</span>}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
