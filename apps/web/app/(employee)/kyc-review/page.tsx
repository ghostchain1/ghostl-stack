import type { Metadata } from 'next';
import { Card } from '@ghostl/ui';
import { localRoute } from '../../../src/lib/local-route';
import type { KycSubmission } from '../../api/kyc-review/route';

export const metadata: Metadata = {
  title: 'KYC Review — GhostChain Employee',
};

type KycResponse = {
  submissions: KycSubmission[];
  stats: { pending: number; under_review: number; escalated: number; approved: number; rejected: number };
};

const fmtTs = (iso: string) => iso.replace('T', ' ').slice(0, 16) + ' UTC';

type KycStatus = KycSubmission['status'];
const STATUS_META: Record<KycStatus, { label: string; color: string }> = {
  pending:        { label: 'Pending',      color: '#8A9BB5' },
  'under-review': { label: 'Under Review', color: '#C9A227' },
  approved:       { label: 'Approved',     color: '#00F0B5' },
  rejected:       { label: 'Rejected',     color: '#FF3B3B' },
  escalated:      { label: 'Escalated',    color: '#7A5CFF' },
};

const RISK_COLOR: Record<string, string> = {
  low:    '#00F0B5',
  medium: '#C9A227',
  high:   '#FF3B3B',
};

const STAT_DEFS: { label: string; key: KycStatus; color: string }[] = [
  { label: 'Pending',      key: 'pending',       color: '#8A9BB5' },
  { label: 'Under Review', key: 'under-review',  color: '#C9A227' },
  { label: 'Escalated',    key: 'escalated',     color: '#7A5CFF' },
  { label: 'Approved',     key: 'approved',      color: '#00F0B5' },
];

export default async function KycReviewPage() {
  const data = await localRoute<KycResponse>('/api/kyc-review');
  const submissions = data?.submissions ?? [];
  const apiStats    = data?.stats;
  return (
    <div className="content">
      {/* Header */}
      <div className="spread" style={{ marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0 }}>KYC Review</h1>
          <p className="muted" style={{ marginTop: 4 }}>Identity verification submissions requiring human review</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="chip" style={{ cursor: 'pointer' }}>Export CSV</button>
          <button className="chip" style={{ cursor: 'pointer' }}>Compliance policy →</button>
        </div>
      </div>

      {/* Stat pills */}
      <div className="card-grid" style={{ marginBottom: 24 }}>
        {STAT_DEFS.map(s => {
          const countMap: Record<string, number> = {
            pending:       apiStats?.pending      ?? submissions.filter(x => x.status === 'pending').length,
            'under-review': apiStats?.under_review ?? submissions.filter(x => x.status === 'under-review').length,
            escalated:     apiStats?.escalated    ?? submissions.filter(x => x.status === 'escalated').length,
            approved:      apiStats?.approved     ?? submissions.filter(x => x.status === 'approved').length,
          };
          const count = countMap[s.key] ?? 0;
          return (
            <Card key={s.label} style={{ textAlign: 'center', padding: '16px 10px' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{count}</div>
              <div className="muted" style={{ fontSize: '0.72rem', marginTop: 6 }}>{s.label}</div>
            </Card>
          );
        })}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['All', 'Pending', 'Under Review', 'Escalated', 'High Risk'].map(f => (
          <button key={f} className={`chip${f === 'All' ? ' badge' : ''}`} style={{ cursor: 'pointer' }}>{f}</button>
        ))}
      </div>

      {/* Submissions table */}
      <Card style={{ padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 700 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
              {['ID', 'Address', 'Name', 'Country', 'Doc Type', 'Risk', 'Status', 'Reviewer', 'Submitted', 'Actions'].map(col => (
                <th key={col} style={{ padding: '10px 12px', textAlign: 'left', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.12em', color: '#8A9BB5', fontWeight: 600, whiteSpace: 'nowrap' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {submissions.map((s, i) => {
              const sm = STATUS_META[s.status];
              return (
                <tr key={s.id} style={{ borderBottom: i < submissions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: s.status === 'escalated' ? 'rgba(122,92,255,0.04)' : undefined }}>
                  <td style={{ padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem', color: '#7A5CFF', whiteSpace: 'nowrap' }}>{s.id}</td>
                  <td style={{ padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.66rem', color: '#8A9BB5' }}>{s.address}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{s.name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem' }}>{s.country}</td>
                  <td style={{ padding: '10px 12px', fontSize: '0.75rem', color: '#8A9BB5', whiteSpace: 'nowrap' }}>{s.docType}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span className="badge" style={{ color: RISK_COLOR[s.risk], background: `${RISK_COLOR[s.risk]}12`, border: `1px solid ${RISK_COLOR[s.risk]}28`, fontSize: '0.58rem', textTransform: 'capitalize' }}>{s.risk}</span>
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <span className="badge" style={{ color: sm.color, background: `${sm.color}12`, border: `1px solid ${sm.color}28`, fontSize: '0.58rem' }}>{sm.label}</span>
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.64rem', color: '#8A9BB5' }}>{s.reviewer ?? 'Unassigned'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', color: '#4A5568', whiteSpace: 'nowrap' }}>{fmtTs(s.submitted)}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    {(s.status === 'pending' || s.status === 'under-review' || s.status === 'escalated') && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="chip" style={{ cursor: 'pointer', fontSize: '0.62rem', color: '#00F0B5' }}>Approve</button>
                        <button className="chip" style={{ cursor: 'pointer', fontSize: '0.62rem', color: '#FF3B3B' }}>Reject</button>
                      </div>
                    )}
                    {s.note && (
                      <div style={{ fontSize: '0.62rem', color: '#C9A227', marginTop: 2 }}>⚠ {s.note}</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
