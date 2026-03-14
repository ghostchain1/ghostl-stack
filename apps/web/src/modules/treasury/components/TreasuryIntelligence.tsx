'use client';

/**
 * TreasuryIntelligence.tsx — AI-augmented treasury analytics dashboard.
 *
 * Shows treasury balances, flow history (sparkline), top drains/inflows,
 * and GhostBrain AI financial recommendations for treasury strategy.
 *
 * All BFF calls go through /api/treasury/* — no direct external fetch.
 */

import { useEffect, useState } from 'react';

interface RecentFlow {
  timestamp:  string;
  type:       'in' | 'out';
  amountGst:  string;
  label:      string;
  txHash:     string;
}

interface AITreasuryRec {
  id:         string;
  summary:    string;
  impact:     string;   // e.g. "+120,000 GST savings/month"
  confidence: number;   // 0–1
  urgency:    'high' | 'medium' | 'low';
}

interface TreasuryIntel {
  totalGst:          string;
  availableGst:      string;
  lockedGst:         string;
  recentFlows:       RecentFlow[];
  aiRecs:            AITreasuryRec[];
  burnRatePerDayGst: string | null;
  runwayDays:        number | null;
  solvencyRatio:     number | null;   // >1 = solvent
}

const URGENCY_STYLE: Record<string, { color: string; bg: string }> = {
  high:   { color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  medium: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  low:    { color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
};

function SolvencyBar({ ratio }: { ratio: number }) {
  const pct   = Math.min(ratio * 50, 100);  // 2.0 = 100%
  const color = ratio >= 1.5 ? '#22c55e' : ratio >= 1.0 ? '#f59e0b' : '#ef4444';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11 }} className="muted">Solvency ratio</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{ratio.toFixed(2)}×</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: '#1f2937', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

export function TreasuryIntelligence() {
  const [data,    setData]    = useState<TreasuryIntel | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'overview' | 'flows' | 'ai'>('overview');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/treasury/intelligence', { cache: 'no-store' });
        if (res.ok) setData(await res.json() as TreasuryIntel);
      } catch { /* keep stale */ } finally {
        setLoading(false);
      }
    };
    void load();
    const t = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(t);
  }, []);

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={tab === id ? 'button' : 'button secondary'}
      style={{ fontSize: 11, padding: '4px 12px' }}
    >
      {label}
    </button>
  );

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span>Treasury Intelligence</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <TabBtn id="overview" label="Overview" />
          <TabBtn id="flows"    label="Flows" />
          <TabBtn id="ai"       label="AI Recs" />
        </div>
      </div>

      {loading && !data && (
        <p className="muted" style={{ fontSize: 12 }}>Loading treasury data…</p>
      )}

      {/* Overview tab */}
      {tab === 'overview' && data && (
        <div className="stack" style={{ gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { label: 'Total GST',     value: data.totalGst,     color: '#e5e7eb' },
              { label: 'Available GST', value: data.availableGst, color: '#22c55e' },
              { label: 'Locked GST',    value: data.lockedGst,    color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  padding: '10px',
                  borderRadius: 6,
                  background: 'var(--surface-1, #111827)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
                <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {data.solvencyRatio != null && <SolvencyBar ratio={data.solvencyRatio} />}

          {data.burnRatePerDayGst && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12 }}>Burn rate</span>
              <span style={{ fontSize: 12 }}>{data.burnRatePerDayGst} GST/day</span>
            </div>
          )}
          {data.runwayDays != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12 }}>Runway</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: data.runwayDays < 90 ? '#ef4444' : '#22c55e' }}>
                {data.runwayDays} days
              </span>
            </div>
          )}
        </div>
      )}

      {/* Flows tab */}
      {tab === 'flows' && data && (
        <div className="stack" style={{ gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {data.recentFlows.length === 0 && (
            <p className="muted" style={{ fontSize: 12 }}>No recent flows.</p>
          )}
          {data.recentFlows.map((f, i) => (
            <div
              key={`${f.txHash}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 8px',
                borderRadius: 5,
                background: 'var(--surface-1, #111827)',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: f.type === 'in' ? '#22c55e' : '#ef4444' }}>
                {f.type === 'in' ? '▲' : '▼'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{f.label}</div>
                <div className="muted" style={{ fontSize: 10 }}>
                  {new Date(f.timestamp).toLocaleString()}
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: f.type === 'in' ? '#22c55e' : '#ef4444' }}>
                {f.type === 'in' ? '+' : '-'}{f.amountGst} GST
              </span>
            </div>
          ))}
        </div>
      )}

      {/* AI Recs tab */}
      {tab === 'ai' && data && (
        <div className="stack" style={{ gap: 10 }}>
          {data.aiRecs.length === 0 && (
            <p className="muted" style={{ fontSize: 12 }}>No AI treasury recommendations at this time.</p>
          )}
          {data.aiRecs.map(rec => {
            const s = URGENCY_STYLE[rec.urgency] ?? URGENCY_STYLE['low'];
            return (
              <div
                key={rec.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: s.bg,
                  border: `1px solid ${s.color}40`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: 'uppercase' }}>
                    {rec.urgency}
                  </span>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>
                    Confidence {Math.round(rec.confidence * 100)}%
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12 }}>{rec.summary}</p>
                {rec.impact && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#22c55e' }}>
                    Impact: {rec.impact}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
