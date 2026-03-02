import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@ghostl/ui';
import { localRoute } from '../../../src/lib/local-route';
import type { Alert } from '../../api/alerts/route';

export const metadata: Metadata = {
  title: 'Command Hub — GhostChain Admin',
};

/* ── Static styles ─────────────────────────────────────────────────── */
const HEALTH_COLOR: Record<string, string> = { ok: '#00F0B5', warn: '#C9A227', crit: '#FF3B3B' };
const SEV_COLOR: Record<string, string>    = { critical: '#FF3B3B', warning: '#C9A227', info: '#00C2FF' };

type StatusResponse = {
  generatedAt: string;
  chains: { key: string; ok: boolean; blockNumber?: string; latencyMs?: number }[];
  services: { id: string; ok: boolean }[];
};

const CHAIN_META: Record<string, { label: string; color: string }> = {
  l1: { label: 'GhostChain', color: '#C9A227' },
  l2: { label: 'GhostL2',    color: '#7A5CFF' },
  l3: { label: 'GhostL3',    color: '#00C2FF' },
};

/* ── Quick-action tiles ────────────────────────────────────────────── */
const QUICK_ACTIONS: { icon: string; label: string; href: string; color: string; desc: string }[] = [
  { icon: '⛓',  label: 'Chain',        href: '/chain',       color: '#C9A227', desc: 'Block production, IBFT status, fork management' },
  { icon: '🖥',  label: 'Nodes',        href: '/nodes',       color: '#00F0B5', desc: 'Validator & RPC node health, restarts' },
  { icon: '🔐',  label: 'Validators',   href: '/validators',  color: '#7A5CFF', desc: 'Validator set, slashing, delegation' },
  { icon: '🗳',  label: 'Governance',   href: '/governance',  color: '#00C2FF', desc: 'Active votes, GIPs, quorum tracking' },
  { icon: '💰',  label: 'Treasury',     href: '/treasury',    color: '#C9A227', desc: 'Reserve allocation, yield, policies' },
  { icon: '📜',  label: 'Compliance',   href: '/compliance',  color: '#8A9BB5', desc: 'Audit trail, transparency reports' },
  { icon: '⚙',   label: 'DevOps',       href: '/devops',      color: '#00F0B5', desc: 'Deploy pipelines, infra, Docker' },
  { icon: '🤖',  label: 'AI Systems',   href: '/ai',          color: '#00F0B5', desc: 'Agent status, GhostSentinel, oracles' },
  { icon: '👥',  label: 'Users',        href: '/users',       color: '#7A5CFF', desc: 'User accounts, roles, access control' },
  { icon: '📈',  label: 'Monitoring',   href: '/monitoring',  color: '#00C2FF', desc: 'Live system metrics, Grafana dashboards' },
  { icon: '🆔',  label: 'KYC Review',   href: '/kyc-review',  color: '#C9A227', desc: 'Identity submissions, approvals, escalations' },
  { icon: '📋',  label: 'Logs',         href: '/logs',        color: '#8A9BB5', desc: 'Aggregated service logs, audit trail' },
];

/* ── Recent admin actions ──────────────────────────────────────────── */
const RECENT_ACTIONS = [
  { ts: '14:22', actor: 'kyc-agent-1',  action: 'Started KYC review KYC-0482'                   },
  { ts: '14:20', actor: 'admin-0',      action: 'GhostPolicyGate.commit() confirmed · GIP-0017'  },
  { ts: '14:18', actor: 'ops-agent-2',  action: 'Assigned TKT-0820 to self'                      },
  { ts: '11:05', actor: 'compliance-1', action: 'Escalated KYC-0479 — sanctions match'            },
  { ts: '09:30', actor: 'admin-0',      action: 'Approved validator 0xB841…E2D3 commission change'},
];

export default async function CommandHubPage() {
  const [statusData, alertsData] = await Promise.all([
    localRoute<StatusResponse>('/api/status'),
    localRoute<{ alerts: Alert[] }>('/api/alerts?ack=false'),
  ]);

  const CHAIN_STATUS = statusData?.chains.map(c => {
    const meta = CHAIN_META[c.key] ?? { label: c.key.toUpperCase(), color: '#8A9BB5' };
    const blockNum = c.blockNumber ? parseInt(c.blockNumber, 16).toLocaleString() : '—';
    const latency  = c.latencyMs ? `${c.latencyMs}ms` : '—';
    return {
      layer:  c.key.toUpperCase(),
      label:  meta.label,
      color:  meta.color,
      height: blockNum,
      time:   latency,
      health: c.ok ? 'ok' : 'crit',
    };
  }) ?? [
    { layer: 'L1', label: 'GhostChain', color: '#C9A227', height: '—', time: '—', health: 'warn' },
    { layer: 'L2', label: 'GhostL2',    color: '#7A5CFF', height: '—', time: '—', health: 'warn' },
    { layer: 'L3', label: 'GhostL3',    color: '#00C2FF', height: '—', time: '—', health: 'warn' },
  ];

  const ACTIVE_ALERTS = (alertsData?.alerts ?? []).slice(0, 5).map(a => ({
    id:       a.id,
    severity: a.severity,
    label:    a.title,
    ts:       a.ts.split('T')[1]?.slice(0, 5) ?? a.ts,
  }));

  const openAlerts = ACTIVE_ALERTS.filter(a => a.severity === 'critical').length;

  return (
    <div className="content">
      {/* Page header */}
      <div className="spread" style={{ marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0 }}>Command Hub</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            GhostChain administrator overview — network health, alerts, and quick navigation
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {openAlerts > 0 && (
            <span className="badge" style={{ background: 'rgba(255,59,59,0.12)', color: '#FF3B3B', border: '1px solid rgba(255,59,59,0.3)' }}>
              {openAlerts} critical
            </span>
          )}
          <button className="chip" style={{ cursor: 'pointer' }}>Status page →</button>
        </div>
      </div>

      {/* Chain status strip */}
      <div className="card-grid" style={{ marginBottom: 20 }}>
        {CHAIN_STATUS.map(c => (
          <Card key={c.layer} style={{ borderLeft: `3px solid ${c.color}` }}>
            <div className="spread" style={{ marginBottom: 6 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', fontWeight: 700, color: c.color, letterSpacing: '0.1em' }}>{c.layer}</span>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: HEALTH_COLOR[c.health], display: 'inline-block', boxShadow: c.health === 'ok' ? `0 0 6px ${HEALTH_COLOR[c.health]}80` : 'none' }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 2 }}>{c.label}</div>
            {c.height !== '—' && (
              <div className="muted" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem' }}>
                #{c.height} · {c.time}
              </div>
            )}
            {c.height === '—' && (
              <div className="muted" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem' }}>
                p99 {c.time}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Two-column layout: alerts + recent activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 28 }}>
        {/* Active alerts */}
        <Card>
          <div className="spread" style={{ marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Active Alerts</span>
            <Link href="/monitoring" className="muted" style={{ fontSize: '0.72rem', textDecoration: 'none', color: '#7A5CFF' }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ACTIVE_ALERTS.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[a.severity], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.8rem' }}>{a.label}</span>
                <span className="muted" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', flexShrink: 0 }}>{a.ts}</span>
              </div>
            ))}
          </div>
          {ACTIVE_ALERTS.length === 0 && <p className="muted" style={{ fontSize: '0.78rem' }}>No active alerts.</p>}
        </Card>

        {/* Recent admin actions */}
        <Card>
          <div className="spread" style={{ marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Recent Actions</span>
            <Link href="/logs" className="muted" style={{ fontSize: '0.72rem', textDecoration: 'none', color: '#7A5CFF' }}>Audit log →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {RECENT_ACTIONS.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: i < RECENT_ACTIONS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <span className="muted" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', flexShrink: 0, marginTop: 1 }}>{a.ts}</span>
                <div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#7A5CFF' }}>[{a.actor}]</span>
                  <span className="muted" style={{ fontSize: '0.76rem', marginLeft: 6 }}>{a.action}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Quick-action grid */}
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.2em', color: '#4A5568', textTransform: 'uppercase', marginBottom: 14 }}>
        Quick Access
      </div>
      <div className="card-grid">
        {QUICK_ACTIONS.map(a => (
          <Link key={a.label} href={a.href} style={{ textDecoration: 'none' }}>
            <Card style={{ height: '100%', transition: 'border-color 0.15s', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: '1.2rem' }}>{a.icon}</span>
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: a.color }}>{a.label}</span>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: '0.74rem', lineHeight: 1.5 }}>{a.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
