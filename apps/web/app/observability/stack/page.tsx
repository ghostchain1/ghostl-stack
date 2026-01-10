'use client';

import { useEffect, useState } from 'react';
import { Card, Badge } from '@ghostl/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Overview = {
  chain: string;
  head?: number;
  finalized?: number;
  lag?: number;
  relayer: { finalized?: number; errors?: number; health?: Record<string, unknown> | null };
  guard: { alerts?: number; deposits?: number; activeAlerts?: Record<string, unknown>[] };
};

export default function StackPage() {
  const [chain, setChain] = useState<'l2' | 'l3'>('l2');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const fallback: Overview = {
    chain,
    head: 0,
    finalized: 0,
    lag: 0,
    relayer: { finalized: 0, errors: 0, health: null },
    guard: { alerts: 0, deposits: 0, activeAlerts: [] }
  };

  const load = async (target: 'l2' | 'l3') => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/stack/overview?chain=${target}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error('failed');
      const json = (await res.json()) as Overview;
      setData({
        ...fallback,
        ...json,
        chain: json.chain || target,
        relayer: { ...fallback.relayer, ...(json.relayer || {}) },
        guard: { ...fallback.guard, ...(json.guard || {}), activeAlerts: json.guard?.activeAlerts || [] }
      });
    } catch {
      setData(fallback);
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
        <Card title={`Head / Finalized (${chain})`} subtitle="op-gate">
          <div className="stack">
            <div className="spread">
              <span className="muted">Head</span>
              <span>{data?.head ?? 0}</span>
            </div>
            <div className="spread">
              <span className="muted">Finalized</span>
              <span>{data?.finalized ?? 0}</span>
            </div>
            <div className="spread">
              <span className="muted">Lag</span>
              <Badge tone={(data?.lag || 0) > 5 ? 'warning' : 'default'}>{data?.lag ?? 0}</Badge>
            </div>
          </div>
        </Card>
        <Card title="Relayer" subtitle="health + totals">
          <div className="stack">
            <div className="spread">
              <span className="muted">Finalized batches</span>
              <span>{data?.relayer.finalized ?? 0}</span>
            </div>
            <div className="spread">
              <span className="muted">Errors</span>
              <Badge tone={data?.relayer.errors ? 'critical' : 'default'}>{data?.relayer.errors ?? 0}</Badge>
            </div>
            <div className="muted">Health: {data?.relayer.health ? 'ok' : 'n/a'}</div>
          </div>
        </Card>
        <Card title="Guard" subtitle="alerts/deposits">
          <div className="stack">
            <div className="spread">
              <span className="muted">Deposits seen</span>
              <span>{data?.guard.deposits ?? 0}</span>
            </div>
            <div className="spread">
              <span className="muted">Alerts total</span>
              <Badge tone={data?.guard.alerts ? 'critical' : 'default'}>{data?.guard.alerts ?? 0}</Badge>
            </div>
            <div className="stack">
              <span className="muted">Active alerts</span>
              {(data?.guard.activeAlerts || []).slice(0, 3).map((a: Record<string, unknown>, idx) => {
                const reasons = Array.isArray(a.reasons) ? (a.reasons as string[]).join(', ') : undefined;
                const label = reasons || (a.tx as string | undefined) || (a.from as string | undefined) || 'alert';
                return (
                  <div key={idx} className="muted" style={{ fontSize: '0.85rem' }}>
                    {label}
                  </div>
                );
              })}
              {(data?.guard.activeAlerts?.length || 0) === 0 && <span className="muted">None</span>}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
