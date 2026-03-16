'use client';

/**
 * app/monitor/page.tsx — GhostStack Infrastructure Monitor.
 *
 * Live health breakdown of all GhostChain services: RPC endpoints, sequencers,
 * bridges, AI agents, and validator nodes.  Refreshes every 10 s and
 * supplements with WebSocket data.
 */

import { useEffect, useState } from 'react';
import { useRealtime } from '../../lib/ws';
import { apiRequest } from '../../src/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type ServiceStatus = 'ok' | 'degraded' | 'down' | 'unknown';

interface ServiceInfo {
  name:       string;
  group:      string;
  status:     ServiceStatus;
  latencyMs:  number | null;
  uptime:     number | null;   // percent
  detail:     string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(s: ServiceStatus): string {
  if (s === 'ok')      return 'var(--success)';
  if (s === 'degraded') return 'var(--warning)';
  if (s === 'down')    return 'var(--danger)';
  return 'var(--muted)';
}

function statusDotClass(s: ServiceStatus): string {
  if (s === 'ok')      return 'status-dot--ok';
  if (s === 'degraded') return 'status-dot--warn';
  if (s === 'down')    return 'status-dot--danger';
  return 'status-dot--muted';
}

// ── Default / skeleton data ────────────────────────────────────────────────────

const STATIC_SERVICES: ServiceInfo[] = [
  { name: 'GhostChain L1 RPC',   group: 'Chain',      status: 'unknown', latencyMs: null, uptime: null, detail: ':18545' },
  { name: 'GhostL2 RPC',         group: 'Chain',      status: 'unknown', latencyMs: null, uptime: null, detail: ':29545' },
  { name: 'GhostL3 RPC',         group: 'Chain',      status: 'unknown', latencyMs: null, uptime: null, detail: ':39545' },
  { name: 'Cosmos LCD',          group: 'Chain',      status: 'unknown', latencyMs: null, uptime: null, detail: ':1317' },
  { name: 'CometBFT RPC',        group: 'Chain',      status: 'unknown', latencyMs: null, uptime: null, detail: ':26657' },
  { name: 'L2 Sequencer',        group: 'OP Stack',   status: 'unknown', latencyMs: null, uptime: null, detail: 'op-node' },
  { name: 'L3 Sequencer',        group: 'OP Stack',   status: 'unknown', latencyMs: null, uptime: null, detail: 'op-node' },
  { name: 'L1→L2 Bridge',        group: 'Bridge',     status: 'unknown', latencyMs: null, uptime: null, detail: 'L1GhostPortal' },
  { name: 'L2→L3 Bridge',        group: 'Bridge',     status: 'unknown', latencyMs: null, uptime: null, detail: 'L2L3Bridge' },
  { name: 'GhostBrain Core',     group: 'AI',         status: 'unknown', latencyMs: null, uptime: null, detail: ':7900' },
  { name: 'L3 Fee Collector',    group: 'Economics',  status: 'unknown', latencyMs: null, uptime: null, detail: ':7681' },
  { name: 'L2 Revenue Aggreg.',  group: 'Economics',  status: 'unknown', latencyMs: null, uptime: null, detail: ':7682' },
  { name: 'Treasury Engine',     group: 'Economics',  status: 'unknown', latencyMs: null, uptime: null, detail: ':7683' },
  { name: 'Reward Distributor',  group: 'Economics',  status: 'unknown', latencyMs: null, uptime: null, detail: ':7684' },
  { name: 'Compliance API',      group: 'Security',   status: 'unknown', latencyMs: null, uptime: null, detail: ':8090' },
  { name: 'Signing Relay',       group: 'Governance', status: 'unknown', latencyMs: null, uptime: null, detail: ':7910' },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function ServiceRow({ svc }: { svc: ServiceInfo }) {
  return (
    <tr>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`status-dot ${statusDotClass(svc.status)}`} />
          <span style={{ fontWeight: 500 }}>{svc.name}</span>
        </div>
      </td>
      <td>
        <span style={{
          fontSize: '0.72rem',
          padding: '2px 8px',
          borderRadius: 4,
          background: 'rgba(255,255,255,0.06)',
          color: 'var(--muted)',
          fontWeight: 600,
        }}>
          {svc.group}
        </span>
      </td>
      <td style={{ color: statusColor(svc.status), fontWeight: 700, textTransform: 'uppercase', fontSize: '0.76rem' }}>
        {svc.status}
      </td>
      <td style={{ fontFamily: 'var(--font-display)', color: 'var(--muted)' }}>
        {svc.latencyMs != null ? `${svc.latencyMs} ms` : '—'}
      </td>
      <td>
        {svc.uptime != null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="ghost-progress" style={{ width: 80 }}>
              <div
                className={`ghost-progress__fill${svc.uptime < 99 ? ' ghost-progress__fill--warning' : ''}`}
                style={{ width: `${svc.uptime}%` }}
              />
            </div>
            <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{svc.uptime.toFixed(2)}%</span>
          </div>
        ) : (
          <span style={{ color: 'var(--muted)' }}>—</span>
        )}
      </td>
      <td style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{svc.detail ?? '—'}</td>
    </tr>
  );
}

// ── Summary pill ───────────────────────────────────────────────────────────────

function SummaryPill({ services }: { services: ServiceInfo[] }) {
  const ok      = services.filter((s) => s.status === 'ok').length;
  const degraded = services.filter((s) => s.status === 'degraded').length;
  const down    = services.filter((s) => s.status === 'down').length;
  const unknown = services.filter((s) => s.status === 'unknown').length;

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {[
        { label: 'Healthy',  count: ok,       color: 'var(--success)' },
        { label: 'Degraded', count: degraded,  color: 'var(--warning)' },
        { label: 'Down',     count: down,      color: 'var(--danger)' },
        { label: 'Unknown',  count: unknown,   color: 'var(--muted)' },
      ].map((p) => (
        <div key={p.label} style={{
          padding: '8px 18px',
          borderRadius: 8,
          background: 'var(--panel)',
          border: `1px solid ${p.color}44`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minWidth: 80,
        }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: p.color, fontFamily: 'var(--font-display)' }}>
            {p.count}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {p.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MonitorPage() {
  const { connected, healthByChain } = useRealtime();
  const [services, setServices] = useState<ServiceInfo[]>(STATIC_SERVICES);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [filter, setFilter]       = useState<string>('all');

  const fetchHealth = async () => {
    const res = await apiRequest('/api/health/services');
    if (res.ok) {
      const raw = res.data as ServiceInfo[];
      if (Array.isArray(raw) && raw.length > 0) {
        setServices(raw);
      }
    } else {
      // Overlay WS health data onto static list if BFF endpoint unavailable
      setServices((prev) =>
        prev.map((svc) => {
          if (svc.name.includes('L1') && healthByChain['l1'])
            return { ...svc, status: healthByChain['l1'] as ServiceStatus };
          if (svc.name.includes('L2') && healthByChain['l2'])
            return { ...svc, status: healthByChain['l2'] as ServiceStatus };
          if (svc.name.includes('L3') && healthByChain['l3'])
            return { ...svc, status: healthByChain['l3'] as ServiceStatus };
          return svc;
        })
      );
    }
    setLastFetch(new Date());
  };

  useEffect(() => {
    void fetchHealth();
    const iv = setInterval(() => { void fetchHealth(); }, 10_000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthByChain]);

  const groups = Array.from(new Set(services.map((s) => s.group)));
  const visible = filter === 'all' ? services : services.filter((s) => s.group === filter);

  return (
    <div className="page-wrap">
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
            Infrastructure Monitor
          </h1>
          <span className={`status-dot ${connected ? 'status-dot--live' : 'status-dot--danger'}`} />
        </div>
        {lastFetch && (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.8rem' }}>
            Last polled {lastFetch.toLocaleTimeString()} · auto-refresh every 10 s
          </p>
        )}
      </div>

      {/* Summary */}
      <SummaryPill services={services} />

      {/* Group filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['all', ...groups].map((g) => (
          <button
            key={g}
            onClick={() => setFilter(g)}
            style={{
              padding: '4px 14px',
              borderRadius: 20,
              border: `1px solid ${filter === g ? 'var(--accent)' : 'var(--border)'}`,
              background: filter === g ? 'rgba(35,214,166,0.1)' : 'transparent',
              color: filter === g ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              textTransform: 'capitalize',
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="cyber-panel" style={{ padding: 0, overflow: 'auto' }}>
        <table className="cyber-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Group</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Uptime</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((svc) => (
              <ServiceRow key={svc.name} svc={svc} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footnote */}
      <p style={{ color: 'var(--muted)', fontSize: '0.76rem', margin: 0 }}>
        Health data sourced from <code>/api/health/services</code> BFF endpoint, supplemented by WebSocket telemetry.
        Configure service probes in <code>apps/api/src/routes/health.ts</code>.
      </p>
    </div>
  );
}
