import type { Metadata } from 'next';
import { Card } from '@ghostl/ui';
import { localRoute } from '../../../src/lib/local-route';
import type { Alert } from '../../api/alerts/route';

export const metadata: Metadata = {
  title: 'Alerts — GhostChain User',
};

const fmtTs = (iso: string) =>
  iso.replace('T', ' ').slice(0, 16) + ' UTC';

const FALLBACK_ALERTS: Alert[] = [
  { id: 'ALT-0041', severity: 'critical', title: 'Bridge relay latency spike', ts: '2026-03-01T14:22:00Z', ack: false, source: 'l2-bridge-relay', summary: 'Cross-chain relay latency exceeded 3× baseline for 8 minutes. Bridge deposits are unaffected but confirmation times are elevated.' },
  { id: 'ALT-0040', severity: 'warning',  title: 'Wallet nonce gap detected',  ts: '2026-03-01T11:04:00Z', ack: false, source: 'l3-sequencer',   summary: 'A nonce gap on your connected wallet (0x1F3a…B7C9) may delay pending transactions. Reset the nonce in your wallet settings if transactions are stuck.' },
  { id: 'ALT-0039', severity: 'info',     title: 'New governance vote opened', ts: '2026-02-28T18:30:00Z', ack: true,  source: 'governance',      summary: 'GIP-0017: L2 fee parameter adjustment. Voting closes Mar 5, 2026 at 18:00 UTC. Your wallet is eligible to participate.' },
  { id: 'ALT-0038', severity: 'info',     title: 'Treasury yield disbursed',   ts: '2026-02-28T06:00:00Z', ack: true,  source: 'treasury-ai',     summary: 'Quarterly treasury yield distribution completed. 0.00042 GST credited to your staking escrow.' },
  { id: 'ALT-0037', severity: 'warning',  title: 'Validator commission change', ts: '2026-02-27T22:15:00Z', ack: true, source: 'l1-consensus',   summary: 'Validator 0xB841…E2D3 you are delegated to has increased their commission from 5% to 7%. You may re-delegate at any time.' },
];

const SEVERITY: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: '#FF3B3B', bg: 'rgba(255,59,59,0.08)'   },
  warning:  { label: 'Warning',  color: '#C9A227', bg: 'rgba(201,162,39,0.08)'  },
  info:     { label: 'Info',     color: '#00C2FF', bg: 'rgba(0,194,255,0.06)'   },
};

export default async function AlertsPage() {
  const live = await localRoute<{ alerts: Alert[] }>('/api/alerts');
  const alerts = live?.alerts ?? FALLBACK_ALERTS;
  const unread = alerts.filter(a => !a.ack).length;

  return (
    <div className="content">
      {/* Page header */}
      <div className="spread" style={{ marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, lineHeight: 1.2 }}>Alerts</h1>
          {unread > 0 && (
            <p className="muted" style={{ marginTop: 4 }}>
              {unread} unacknowledged alert{unread !== 1 ? 's' : ''} requiring attention
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="chip" style={{ cursor: 'pointer' }}>Mark all read</button>
          <button className="chip" style={{ cursor: 'pointer' }}>Notification settings</button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['All', 'Critical', 'Warning', 'Info', 'Acknowledged'].map(tab => (
          <button key={tab} className={`chip${tab === 'All' ? ' badge' : ''}`} style={{ cursor: 'pointer' }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Alert list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {alerts.map(alert => {
          const s = SEVERITY[alert.severity] ?? SEVERITY.info;
          return (
            <Card key={alert.id} style={{ background: alert.ack ? undefined : s.bg, opacity: alert.ack ? 0.7 : 1 }}>
              <div className="spread">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="badge" style={{ background: `${s.color}18`, color: s.color, border: `1px solid ${s.color}30` }}>
                    {s.label}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{alert.title}</span>
                  {!alert.ack && <span className="chip" style={{ fontSize: '0.6rem', letterSpacing: '0.1em' }}>NEW</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <span className="muted" style={{ fontSize: '0.72rem' }}>{alert.id}</span>
                  {!alert.ack && (
                    <button className="chip" style={{ cursor: 'pointer', fontSize: '0.72rem' }}>Acknowledge</button>
                  )}
                </div>
              </div>
              <p className="muted" style={{ marginTop: 8, fontSize: '0.82rem', lineHeight: 1.6 }}>{alert.summary}</p>
              <div className="muted" style={{ marginTop: 6, fontSize: '0.68rem' }}>{fmtTs(alert.ts)}</div>
            </Card>
          );
        })}
      </div>

      {/* Empty state hint */}
      {alerts.length === 0 && (
        <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
          <p className="muted">No alerts — all clear.</p>
        </Card>
      )}
    </div>
  );
}
