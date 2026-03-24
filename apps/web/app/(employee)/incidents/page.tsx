'use client';

import { useState, useEffect, useCallback } from 'react';

type Incident = {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  assignee?: string;
  layer?: string;
  service?: string;
  openedAt: string;
  updatedAt: string;
  resolvedAt?: string;
};

const SEV_ORDER = ['critical', 'high', 'medium', 'low'];
const SEV_COLOR: Record<string, string> = {
  critical: 'var(--danger)', high: '#fb923c', medium: 'var(--warning)', low: 'var(--accent-3)',
};
const STATUS_CLASS: Record<string, string> = {
  open: 'open', investigating: 'watch', resolved: 'resolved', closed: 'resolved',
};

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'investigating' | 'resolved'>('all');
  const [selected, setSelected] = useState<Incident | null>(null);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/incidents', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        const raw: Incident[] = Array.isArray(d) ? d : (d.incidents ?? []);
        raw.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
        setIncidents(raw);
      }
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(t);
  }, [load]);

  async function updateStatus(id: string, status: Incident['status']) {
    await fetch(`/api/incidents/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => {/* noop */});
    await load();
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : prev);
  }

  async function addComment(id: string) {
    if (!comment.trim()) return;
    await fetch(`/api/incidents/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: comment }),
    }).catch(() => {/* noop */});
    setComment('');
  }

  const filtered = incidents.filter(i => filter === 'all' || i.status === filter);
  const counts = {
    open: incidents.filter(i => i.status === 'open').length,
    investigating: incidents.filter(i => i.status === 'investigating').length,
    resolved: incidents.filter(i => i.status === 'resolved' || i.status === 'closed').length,
  };

  return (
    <div className="portal-page">
      <div className="portal-header">
        <h1 className="portal-title">Incident Management</h1>
        <p className="portal-subtitle">Triage, investigate, and resolve infrastructure and chain incidents</p>
      </div>

      {/* KPI row */}
      <div className="kpi-grid">
        {[
          { label: 'Open', value: counts.open, color: 'var(--danger)' },
          { label: 'Investigating', value: counts.investigating, color: 'var(--warning)' },
          { label: 'Resolved', value: counts.resolved, color: 'var(--success)' },
          { label: 'Total', value: incidents.length, color: 'var(--text)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="kpi-card">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ color }}>{loading ? '…' : value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(0,1fr) minmax(0,380px)' : '1fr', gap: 16 }}>
        {/* Incident list */}
        <div>
          {/* Filter tabs */}
          <div className="portal-tabs" style={{ marginBottom: 14 }}>
            {(['all', 'open', 'investigating', 'resolved'] as const).map(f => (
              <button key={f} className={`portal-tab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && counts[f as keyof typeof counts] > 0 && (
                  <span style={{ marginLeft: 5, fontSize: '0.72rem' }}>({counts[f as keyof typeof counts]})</span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>Loading incidents…</div>
          ) : filtered.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              No {filter !== 'all' ? filter + ' ' : ''}incidents
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(inc => (
                <div
                  key={inc.id}
                  className={`incident-card ${STATUS_CLASS[inc.status]}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelected(selected?.id === inc.id ? null : inc)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700 }}>{inc.title}</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                      background: SEV_COLOR[inc.severity] + '22', color: SEV_COLOR[inc.severity],
                    }}>{inc.severity.toUpperCase()}</span>
                    <span className={`status-tag ${STATUS_CLASS[inc.status]}`}>{inc.status}</span>
                    {inc.layer && <span className="badge">{inc.layer}</span>}
                    <span style={{ color: 'var(--muted)', fontSize: '0.78rem', marginLeft: 'auto' }}>{inc.openedAt}</span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{inc.description}</div>
                  {inc.service && <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Service: {inc.service}</div>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {inc.status !== 'investigating' && (
                      <button
                        className="button secondary"
                        style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                        onClick={e => { e.stopPropagation(); void updateStatus(inc.id, 'investigating'); }}
                      >Investigate</button>
                    )}
                    {inc.status !== 'resolved' && inc.status !== 'closed' && (
                      <button
                        className="button"
                        style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                        onClick={e => { e.stopPropagation(); void updateStatus(inc.id, 'resolved'); }}
                      >Resolve</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card" style={{ alignSelf: 'flex-start', position: 'sticky', top: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', flex: 1 }}>{selected.title}</h3>
              <button
                onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}
              >✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { label: 'ID', value: selected.id },
                { label: 'Severity', value: selected.severity.toUpperCase(), color: SEV_COLOR[selected.severity] },
                { label: 'Status', value: selected.status },
                { label: 'Layer', value: selected.layer ?? '—' },
                { label: 'Service', value: selected.service ?? '—' },
                { label: 'Opened', value: selected.openedAt },
                { label: 'Updated', value: selected.updatedAt },
                { label: 'Resolved', value: selected.resolvedAt ?? '—' },
              ].map(({ label, value, color }) => (
                <div key={label} className="info-row" style={{ padding: '8px 0' }}>
                  <span className="info-label">{label}</span>
                  <span className="info-value" style={color ? { color } : {}}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="portal-section-title" style={{ marginBottom: 8 }}>Add Comment</div>
              <textarea
                className="input"
                rows={3}
                placeholder="Investigation notes…"
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              <button
                className="button"
                style={{ marginTop: 8, padding: '8px 16px', fontSize: '0.85rem' }}
                onClick={() => void addComment(selected.id)}
              >Post Comment</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
