'use client';

import { useState, useEffect, useCallback } from 'react';

type Alert = {
  id: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info' | 'ok';
  source: string;
  layer?: string;
  acknowledged: boolean;
  createdAt: string;
};

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--danger)', warning: 'var(--warning)',
  info: 'var(--accent-3)', ok: 'var(--success)',
};
const SEV_LABEL: Record<string, string> = {
  critical: '● Critical', warning: '▲ Warning', info: '◆ Info', ok: '✓ OK',
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [ackSet, setAckSet] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts/my', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setAlerts(Array.isArray(d) ? d : (d.alerts ?? []));
      }
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 15_000);
    return () => clearInterval(t);
  }, [load]);

  function acknowledge(id: string) {
    setAckSet(prev => new Set([...prev, id]));
    fetch(`/api/alerts/${id}/acknowledge`, { method: 'POST' }).catch(() => {/* noop */});
  }

  function acknowledgeAll() {
    const visibleIds = filtered.map(a => a.id);
    setAckSet(prev => new Set([...prev, ...visibleIds]));
    fetch('/api/alerts/acknowledge-all', { method: 'POST' }).catch(() => {/* noop */});
  }

  const filtered = alerts.filter(a => {
    if (filter === 'all') return true;
    return a.severity === filter;
  });

  const counts = {
    critical: alerts.filter(a => a.severity === 'critical' && !a.acknowledged && !ackSet.has(a.id)).length,
    warning: alerts.filter(a => a.severity === 'warning').length,
    info: alerts.filter(a => a.severity === 'info').length,
  };

  return (
    <div className="portal-page">
      <div className="portal-header">
        <h1 className="portal-title">Alerts</h1>
        <p className="portal-subtitle">Live alerts from GhostChain L1 / L2 / L3 relevant to your account</p>
      </div>

      {/* Summary KPIs */}
      <div className="kpi-grid">
        {[
          { label: 'Critical', value: counts.critical, color: 'var(--danger)' },
          { label: 'Warnings', value: counts.warning, color: 'var(--warning)' },
          { label: 'Info', value: counts.info, color: 'var(--accent-3)' },
          { label: 'Total Alerts', value: alerts.length, color: 'var(--text)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="kpi-card">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ color }}>{loading ? '…' : value}</div>
          </div>
        ))}
      </div>

      {/* Filters + action */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'critical', 'warning', 'info'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
              background: filter === f ? 'rgba(35,214,166,0.12)' : 'rgba(255,255,255,0.04)',
              color: filter === f ? 'var(--accent)' : 'var(--muted)',
              fontWeight: filter === f ? 700 : 400, cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && counts[f as keyof typeof counts] > 0 && (
              <span style={{
                marginLeft: 6, padding: '1px 7px', borderRadius: 999, fontSize: '0.7rem',
                background: SEV_COLOR[f] + '25', color: SEV_COLOR[f], fontWeight: 700,
              }}>{counts[f as keyof typeof counts]}</span>
            )}
          </button>
        ))}
        {filtered.length > 0 && (
          <button
            onClick={acknowledgeAll}
            className="button secondary"
            style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: '0.85rem' }}
          >Acknowledge All</button>
        )}
      </div>

      {/* Alerts list */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>Loading alerts…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>✓</div>
          <div>No {filter !== 'all' ? filter + ' ' : ''}alerts</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(alert => {
            const isAcked = alert.acknowledged || ackSet.has(alert.id);
            return (
              <div
                key={alert.id}
                className="alert-row"
                style={{ opacity: isAcked ? 0.5 : 1 }}
              >
                <div
                  className={`alert-dot ${alert.severity}`}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{alert.title}</span>
                    <span style={{ color: SEV_COLOR[alert.severity], fontSize: '0.75rem', fontWeight: 700 }}>
                      {SEV_LABEL[alert.severity]}
                    </span>
                    {alert.layer && <span className="badge">{alert.layer}</span>}
                    <span style={{ color: 'var(--muted)', fontSize: '0.75rem', marginLeft: 'auto' }}>{alert.createdAt}</span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 4 }}>{alert.message}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: 4 }}>Source: {alert.source}</div>
                </div>
                {!isAcked && (
                  <button
                    onClick={() => acknowledge(alert.id)}
                    className="button secondary"
                    style={{ padding: '5px 10px', fontSize: '0.78rem', flexShrink: 0 }}
                  >Ack</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
