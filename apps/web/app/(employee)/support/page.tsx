import type { Metadata } from 'next';
import { Card } from '@ghostl/ui';
import { localRoute } from '../../../src/lib/local-route';
import type { Ticket } from '../../api/support/tickets/route';

export const metadata: Metadata = {
  title: 'Support — GhostChain Employee',
};

type TicketResponse = { tickets: Ticket[]; stats: { open: number; in_progress: number; resolved: number } };

const fmtTs = (iso: string) => iso.replace('T', ' ').slice(0, 16) + ' UTC';

const PRIORITY_META: Record<string, { color: string }> = {
  high:   { color: '#FF3B3B' },
  medium: { color: '#C9A227' },
  low:    { color: '#00C2FF' },
};
const STATUS_META: Record<string, { color: string; label: string }> = {
  open:         { color: '#FF3B3B', label: 'Open'        },
  'in-progress':{ color: '#C9A227', label: 'In Progress' },
  resolved:     { color: '#00F0B5', label: 'Resolved'    },
};

export default async function SupportPage() {
  const data    = await localRoute<TicketResponse>('/api/support/tickets');
  const tickets = data?.tickets ?? [];
  const STATS   = [
    { label: 'Open',        value: data?.stats.open        ?? 0, color: '#FF3B3B' },
    { label: 'In Progress', value: data?.stats.in_progress ?? 0, color: '#C9A227' },
    { label: 'Resolved',    value: data?.stats.resolved    ?? 0, color: '#00F0B5' },
    { label: 'Total',       value: tickets.length,               color: '#7A5CFF' },
  ];
  return (
    <div className="content">
      {/* Header */}
      <div className="spread" style={{ marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0 }}>Support Queue</h1>
          <p className="muted" style={{ marginTop: 4 }}>User tickets, escalations, and resolution tracking</p>
        </div>
        <button className="chip" style={{ cursor: 'pointer' }}>+ New ticket</button>
      </div>

      {/* Stats row */}
      <div className="card-grid" style={{ marginBottom: 28 }}>
        {STATS.map(s => (
          <Card key={s.label} style={{ textAlign: 'center', padding: '18px 12px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{s.value}</div>
            <div className="muted" style={{ fontSize: '0.75rem', marginTop: 6 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['All', 'Open', 'In Progress', 'Resolved', 'High Priority'].map(f => (
          <button key={f} className={`chip${f === 'All' ? ' badge' : ''}`} style={{ cursor: 'pointer' }}>{f}</button>
        ))}
      </div>

      {/* Ticket table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
              {['ID', 'User', 'Subject', 'Priority', 'Status', 'Assigned', 'Created'].map(col => (
                <th key={col} style={{ padding: '10px 14px', textAlign: 'left', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.12em', color: 'var(--color-muted, #8A9BB5)', fontWeight: 600, whiteSpace: 'nowrap' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((t, i) => {
              const pm = PRIORITY_META[t.priority] ?? PRIORITY_META.low;
              const sm = STATUS_META[t.status]   ?? STATUS_META.open;
              return (
                <tr key={t.id} style={{ borderBottom: i < tickets.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', opacity: t.status === 'resolved' ? 0.65 : 1 }}>
                  <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', color: '#7A5CFF', whiteSpace: 'nowrap' }}>{t.id}</td>
                  <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', color: 'var(--color-muted, #8A9BB5)', whiteSpace: 'nowrap' }}>{t.user}</td>
                  <td style={{ padding: '10px 14px' }}>{t.subject}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <span className="badge" style={{ color: pm.color, background: `${pm.color}15`, border: `1px solid ${pm.color}28`, textTransform: 'capitalize', fontSize: '0.62rem' }}>{t.priority}</span>
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <span className="badge" style={{ color: sm.color, background: `${sm.color}15`, border: `1px solid ${sm.color}28`, fontSize: '0.62rem' }}>{sm.label}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem', color: 'var(--color-muted)' }}>{t.assigned ?? 'Unassigned'}</td>
                  <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: 'var(--color-dim, #4A5568)', whiteSpace: 'nowrap' }}>{fmtTs(t.created)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
