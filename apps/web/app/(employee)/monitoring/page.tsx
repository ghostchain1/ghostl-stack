import type { Metadata } from 'next';
import { Card } from '@ghostl/ui';
import { localRoute } from '../../../src/lib/local-route';
import type { MetricGroup } from '../../api/monitoring/metrics/route';

export const metadata: Metadata = {
  title: 'Monitoring — GhostChain Employee',
};

type MetricsResponse = { ts: string; metrics: MetricGroup[]; summary: { ok: number; warn: number; crit: number } };

type Health = 'ok' | 'warn' | 'crit';
const H: Record<Health, { color: string; label: string }> = {
  ok:   { color: '#00F0B5', label: 'Healthy'  },
  warn: { color: '#C9A227', label: 'Warning'  },
  crit: { color: '#FF3B3B', label: 'Critical' },
};

/** Format technical metric key → display label */
const fmtName = (key: string) =>
  key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
     .replace(/ P(\d+)$/, ' p$1').replace(/ Ms$/, ' ms').replace(/ S$/, 's').replace(/ Pct$/, ' %')
     .replace(/ Tps$/, ' TPS');

/** Format value + optional unit for display */
const fmtVal = (value: string, unit?: string) =>
  unit ? value + unit : value;

const RECENT_EVENTS = [
  { ts: '14:22', level: 'warn', msg: 'L3 prover p95 latency exceeded 1s threshold · prover-03'     },
  { ts: '11:05', level: 'warn', msg: 'L2 liquidity pool utilisation at 84% · approaching limit'    },
  { ts: '09:00', level: 'info', msg: 'Scheduled metrics retention job completed · 30-day rollup'   },
  { ts: '06:00', level: 'info', msg: 'Treasury yield distribution confirmed on-chain · block 2847112' },
  { ts: '02:30', level: 'ok',   msg: 'All prover nodes restarted successfully after update'         },
];
const LEVEL_COLOR: Record<string, string> = { warn: '#C9A227', info: '#00C2FF', ok: '#00F0B5', crit: '#FF3B3B' };

export default async function MonitoringPage() {
  const data     = await localRoute<MetricsResponse>('/api/monitoring/metrics');
  const METRICS  = data?.metrics ?? [];
  const totalWarn = data?.summary.warn ?? METRICS.flatMap(g => g.items).filter(i => i.health === 'warn').length;
  const totalCrit = data?.summary.crit ?? METRICS.flatMap(g => g.items).filter(i => i.health === 'crit').length;

  return (
    <div className="content">
      {/* Header */}
      <div className="spread" style={{ marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0 }}>System Monitoring</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Live health metrics across L1 / L2 / L3 / AI and infrastructure
            {(totalWarn + totalCrit) > 0 && (
              <> — <span style={{ color: '#C9A227' }}>{totalWarn} warning{totalWarn !== 1 ? 's' : ''}</span>{totalCrit > 0 && <>, <span style={{ color: '#FF3B3B' }}>{totalCrit} critical</span></>}</>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="chip" style={{ cursor: 'pointer' }}>Grafana →</button>
          <button className="chip" style={{ cursor: 'pointer' }}>Refresh</button>
        </div>
      </div>

      {/* Metric groups */}
      <div className="card-grid" style={{ marginBottom: 28 }}>
        {METRICS.map(group => (
          <Card key={group.group}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 14, letterSpacing: '0.02em' }}>{group.group}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.items.map(item => {
                const h = H[item.health as Health] ?? H.ok;
                return (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: h.color, flexShrink: 0, marginRight: 10, boxShadow: item.health === 'ok' ? `0 0 4px ${h.color}60` : 'none' }} />
                    <span className="muted" style={{ flex: 1, fontSize: '0.76rem' }}>{fmtName(item.name)}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem', fontWeight: 700, color: h.color, marginRight: 10 }}>{fmtVal(item.value, item.unit)}</span>
                    <span className="muted" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem' }}>{fmtVal(item.target, item.unit)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {/* Recent events */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 14 }}>Recent Events (today)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {RECENT_EVENTS.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.79rem', borderBottom: i < RECENT_EVENTS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', paddingBottom: 6 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#4A5568', flexShrink: 0, fontSize: '0.7rem', marginTop: 1 }}>{e.ts}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', fontWeight: 700, color: LEVEL_COLOR[e.level] ?? '#8A9BB5', flexShrink: 0, marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{e.level.toUpperCase().padEnd(4)}</span>
              <span className="muted" style={{ lineHeight: 1.5 }}>{e.msg}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
