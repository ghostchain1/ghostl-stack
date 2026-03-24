'use client';

import { useState, useEffect, useCallback } from 'react';

type Ticket = {
  id: string;
  userId: string;
  userName?: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: string;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  responses: { author: string; message: string; createdAt: string; isStaff: boolean }[];
};

const PRIORITY_COLOR: Record<string, string> = {
  low: 'var(--muted)', normal: 'var(--accent-3)', high: 'var(--warning)', urgent: 'var(--danger)',
};
const STATUS_CLS: Record<string, string> = {
  open: 'open', in_progress: 'watch', resolved: 'resolved', closed: 'resolved',
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress'>('open');
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/support/tickets', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setTickets(Array.isArray(d) ? d : (d.tickets ?? []));
      }
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function sendReply(id: string) {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        setReply('');
        await load();
        const updated = tickets.find(t => t.id === id);
        if (updated) setSelected(updated);
      }
    } catch {/* ignore */}
    finally { setSending(false); }
  }

  async function updateStatus(id: string, status: Ticket['status']) {
    await fetch(`/api/support/tickets/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => {/* noop */});
    await load();
  }

  const filtered = tickets.filter(t => filter === 'all' || t.status === filter);
  const counts = {
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
  };

  return (
    <div className="portal-page">
      <div className="portal-header">
        <h1 className="portal-title">Support Queue</h1>
        <p className="portal-subtitle">Manage user support tickets, reply to queries, and escalate issues</p>
      </div>

      <div className="kpi-grid">
        {[
          { label: 'Open', value: counts.open, color: 'var(--danger)' },
          { label: 'In Progress', value: counts.in_progress, color: 'var(--warning)' },
          { label: 'Resolved', value: counts.resolved, color: 'var(--success)' },
          { label: 'Total', value: tickets.length, color: 'var(--text)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="kpi-card">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ color }}>{loading ? '…' : value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(0,1fr) minmax(0,420px)' : '1fr', gap: 16 }}>
        <div>
          <div className="portal-tabs" style={{ marginBottom: 14 }}>
            {([
              ['all', `All (${tickets.length})`],
              ['open', `Open (${counts.open})`],
              ['in_progress', `In Progress (${counts.in_progress})`],
            ] as [string, string][]).map(([val, label]) => (
              <button key={val} className={`portal-tab${filter === val ? ' active' : ''}`} onClick={() => setFilter(val as typeof filter)}>
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>Loading tickets…</div>
          ) : filtered.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No tickets</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(t => (
                <div
                  key={t.id}
                  className="incident-card"
                  style={{
                    cursor: 'pointer',
                    borderColor: selected?.id === t.id ? 'var(--accent)' : 'var(--border)',
                    background: selected?.id === t.id ? 'rgba(35,214,166,0.05)' : undefined,
                  }}
                  onClick={() => setSelected(selected?.id === t.id ? null : t)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{t.subject}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: PRIORITY_COLOR[t.priority] }}>
                      {t.priority.toUpperCase()}
                    </span>
                    <span className={`status-tag ${STATUS_CLS[t.status]}`}>{t.status.replace('_', ' ')}</span>
                    <span style={{ color: 'var(--muted)', fontSize: '0.78rem', marginLeft: 'auto' }}>{t.createdAt}</span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    {t.userName ?? t.userId} · {t.category}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{t.message.slice(0, 120)}{t.message.length > 120 ? '…' : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ticket detail */}
        {selected && (
          <div className="card" style={{ alignSelf: 'flex-start', position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', flex: 1 }}>{selected.subject}</h3>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className={`status-tag ${STATUS_CLS[selected.status]}`}>{selected.status.replace('_', ' ')}</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: PRIORITY_COLOR[selected.priority], alignSelf: 'center' }}>
                {selected.priority.toUpperCase()}
              </span>
            </div>

            {/* Conversation */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, maxHeight: 260, overflowY: 'auto' }}>
              {/* Original message */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 4 }}>
                  {selected.userName ?? selected.userId} · {selected.createdAt}
                </div>
                <div style={{ fontSize: '0.88rem' }}>{selected.message}</div>
              </div>
              {selected.responses.map((r, i) => (
                <div key={i} style={{
                  padding: '10px 12px',
                  borderBottom: i < selected.responses.length - 1 ? '1px solid var(--border)' : 'none',
                  background: r.isStaff ? 'rgba(35,214,166,0.05)' : 'transparent',
                }}>
                  <div style={{ fontSize: '0.78rem', color: r.isStaff ? 'var(--accent)' : 'var(--muted)', marginBottom: 4 }}>
                    {r.author} {r.isStaff ? '(Staff)' : ''} · {r.createdAt}
                  </div>
                  <div style={{ fontSize: '0.88rem' }}>{r.message}</div>
                </div>
              ))}
            </div>

            <textarea
              className="input"
              rows={3}
              placeholder="Your reply…"
              value={reply}
              onChange={e => setReply(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="button"
                style={{ flex: 1, padding: '9px 12px', fontSize: '0.85rem' }}
                disabled={sending}
                onClick={() => void sendReply(selected.id)}
              >{sending ? 'Sending…' : 'Send Reply'}</button>
              {selected.status === 'open' && (
                <button
                  className="button secondary"
                  style={{ padding: '9px 12px', fontSize: '0.85rem' }}
                  onClick={() => void updateStatus(selected.id, 'in_progress')}
                >Claim</button>
              )}
              {selected.status !== 'resolved' && selected.status !== 'closed' && (
                <button
                  className="button secondary"
                  style={{ padding: '9px 12px', fontSize: '0.85rem', color: 'var(--success)' }}
                  onClick={() => void updateStatus(selected.id, 'resolved')}
                >Resolve</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
