'use client';

import { useState, useEffect, useCallback } from 'react';

type KycEntry = {
  id: string;
  userId: string;
  name: string;
  email: string;
  submittedAt: string;
  reviewedAt?: string;
  status: 'pending' | 'approved' | 'rejected' | 'requires_info';
  documents: string[];
  riskLevel?: 'low' | 'medium' | 'high';
  reviewedBy?: string;
  notes?: string;
};

const STATUS_MAP = {
  pending: { label: 'Pending', cls: 'pending' },
  approved: { label: 'Approved', cls: 'approved' },
  rejected: { label: 'Rejected', cls: 'rejected' },
  requires_info: { label: 'Needs Info', cls: 'watch' },
} as const;

const RISK_COLOR: Record<string, string> = {
  low: 'var(--success)', medium: 'var(--warning)', high: 'var(--danger)',
};

export default function KycReviewPage() {
  const [entries, setEntries] = useState<KycEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'requires_info'>('pending');
  const [selected, setSelected] = useState<KycEntry | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/kyc/queue', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setEntries(Array.isArray(d) ? d : (d.entries ?? []));
      }
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 20_000);
    return () => clearInterval(t);
  }, [load]);

  async function decide(id: string, decision: 'approved' | 'rejected' | 'requires_info') {
    setSubmitting(true);
    try {
      await fetch(`/api/kyc/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes }),
      });
      setSelected(null);
      setNotes('');
      await load();
    } catch {/* ignore */}
    finally { setSubmitting(false); }
  }

  const filtered = entries.filter(e => filter === 'all' || e.status === filter);
  const pendingCount = entries.filter(e => e.status === 'pending').length;
  const requiresInfoCount = entries.filter(e => e.status === 'requires_info').length;

  return (
    <div className="portal-page">
      <div className="portal-header">
        <h1 className="portal-title">KYC Review Queue</h1>
        <p className="portal-subtitle">Review identity verification submissions and manage compliance decisions</p>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        {[
          { label: 'Pending Review', value: pendingCount, color: 'var(--warning)' },
          { label: 'Needs Info', value: requiresInfoCount, color: 'var(--accent-3)' },
          { label: 'Approved (all)', value: entries.filter(e => e.status === 'approved').length, color: 'var(--success)' },
          { label: 'Total Queue', value: entries.length, color: 'var(--text)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="kpi-card">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ color }}>{loading ? '…' : value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(0,1fr) minmax(0,360px)' : '1fr', gap: 16 }}>
        {/* Queue */}
        <div>
          <div className="portal-tabs" style={{ marginBottom: 14 }}>
            {([
              ['all', 'All'],
              ['pending', `Pending (${pendingCount})`],
              ['requires_info', `Needs Info (${requiresInfoCount})`],
            ] as const).map(([val, label]) => (
              <button key={val} className={`portal-tab${filter === val ? ' active' : ''}`} onClick={() => setFilter(val)}>
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>Loading queue…</div>
          ) : filtered.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>✓</div>
              <div style={{ color: 'var(--muted)' }}>Queue is empty</div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              {filtered.map((e, idx) => (
                <div
                  key={e.id}
                  onClick={() => { setSelected(selected?.id === e.id ? null : e); setNotes(e.notes ?? ''); }}
                  style={{
                    padding: '14px 16px', cursor: 'pointer',
                    borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                    background: selected?.id === e.id ? 'rgba(35,214,166,0.06)' : 'transparent',
                  }}
                >
                  <div className="kyc-row" style={{ padding: 0, borderBottom: 'none' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{e.name}</div>
                      <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{e.email}</div>
                    </div>
                    <div>
                      <span className={`status-tag ${STATUS_MAP[e.status].cls}`}>{STATUS_MAP[e.status].label}</span>
                    </div>
                    <div>
                      {e.riskLevel && (
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: RISK_COLOR[e.riskLevel] }}>
                          {e.riskLevel.toUpperCase()} RISK
                        </span>
                      )}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{e.submittedAt}</div>
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
              <h3 style={{ margin: 0, flex: 1, fontSize: '0.95rem' }}>{selected.name}</h3>
              <button
                onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}
              >✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 14 }}>
              {[
                { label: 'User ID', value: selected.userId },
                { label: 'Email', value: selected.email },
                { label: 'Status', value: STATUS_MAP[selected.status].label },
                { label: 'Risk Level', value: selected.riskLevel?.toUpperCase() ?? '—', color: selected.riskLevel ? RISK_COLOR[selected.riskLevel] : undefined },
                { label: 'Submitted', value: selected.submittedAt },
                { label: 'Documents', value: selected.documents.join(', ') || '—' },
              ].map(({ label, value, color }) => (
                <div key={label} className="info-row" style={{ padding: '8px 0' }}>
                  <span className="info-label">{label}</span>
                  <span className="info-value" style={color ? { color } : {}}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 12 }}>
              <div className="portal-section-title" style={{ marginBottom: 6 }}>Review Notes</div>
              <textarea
                className="input"
                rows={3}
                placeholder="Decision notes, reason for rejection, etc."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="button"
                style={{ flex: 1, padding: '9px 12px', fontSize: '0.85rem', background: 'rgba(114,242,167,0.2)', color: 'var(--success)' }}
                disabled={submitting}
                onClick={() => void decide(selected.id, 'approved')}
              >Approve</button>
              <button
                className="button secondary"
                style={{ flex: 1, padding: '9px 12px', fontSize: '0.85rem' }}
                disabled={submitting}
                onClick={() => void decide(selected.id, 'requires_info')}
              >Request Info</button>
              <button
                className="button"
                style={{ flex: 1, padding: '9px 12px', fontSize: '0.85rem', background: 'rgba(255,107,107,0.18)', color: 'var(--danger)' }}
                disabled={submitting}
                onClick={() => void decide(selected.id, 'rejected')}
              >Reject</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
