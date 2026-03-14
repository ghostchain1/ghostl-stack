'use client';

/**
 * Treasury Intelligence Dashboard — Phase 37
 *
 * Full-fidelity treasury view with GST supply metrics, flow history,
 * AI recommendations from GhostBrain, and solvency indicators.
 *
 * Data: /api/treasury/intelligence  (polled every 20 s)
 * All AI recommendations are display-only; approve action goes to
 * /api/hyperghost for human ratification.
 */

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TreasuryFlow {
  id?:        string;
  type?:      string;
  amount?:    string;
  direction?: 'in' | 'out';
  timestamp?: string;
  note?:      string;
}

interface AIRecommendation {
  id?:        string;
  action?:    string;
  rationale?: string;
  impact?:    string;
  priority?:  'high' | 'medium' | 'low';
}

interface TreasuryData {
  totalGst?:          string;
  availableGst?:      string;
  lockedGst?:         string;
  burnRatePerDayGst?: string | null;
  runwayDays?:        number | null;
  solvencyRatio?:     number | null;
  recentFlows?:       TreasuryFlow[];
  aiRecs?:            AIRecommendation[];
  timestamp?:         string;
  error?:             string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function gstDisplay(val?: string | null): string {
  if (!val || val === '—') return '—';
  const n = parseFloat(val);
  if (Number.isNaN(n)) return val;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B GST`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M GST`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K GST`;
  return `${n.toFixed(2)} GST`;
}

function MetricCard({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background:'#111827', border:'1px solid #1e1e2e', borderRadius:8, padding:'14px 16px' }}>
      <div style={{ fontSize:10, color:'#6b7280', textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:700, color: color ?? '#e2e8f0', fontFamily:'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'#4b5563', marginTop:4 }}>{sub}</div>}
    </div>
  );
}

function SolvencyBar({ ratio }: { ratio: number }) {
  const pct   = Math.min(Math.max(ratio * 100, 0), 100);
  const color = ratio >= 1.5 ? '#22c55e' : ratio >= 1.0 ? '#f59e0b' : '#ef4444';
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:11, color:'#9ca3af' }}>
        <span>Solvency Ratio</span>
        <span style={{ color, fontWeight:700 }}>{ratio.toFixed(2)}x</span>
      </div>
      <div style={{ background:'#1e1e2e', borderRadius:4, height:6 }}>
        <div style={{ background:color, width:`${pct}%`, height:'100%', borderRadius:4, transition:'width 0.5s' }} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TreasuryIntelligence() {
  const [data,    setData]    = useState<TreasuryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [toast,   setToast]   = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/treasury/intelligence', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as TreasuryData);
    } catch (e) {
      setData({ error: e instanceof Error ? e.message : 'Fetch failed' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const intv = setInterval(() => void fetchData(), 20_000);
    return () => clearInterval(intv);
  }, [fetchData]);

  const approveRec = async (rec: AIRecommendation, idx: number) => {
    const key = String(idx);
    setApproving(key);
    try {
      const res = await fetch('/api/hyperghost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', recommendation: rec, source: 'treasury-intelligence' }),
      });
      if (res.ok) {
        setToast('Recommendation forwarded to governance relay for ratification');
      } else {
        setToast('Relay unavailable — try again');
      }
    } catch {
      setToast('Network error — ratification relay unreachable');
    } finally {
      setApproving(null);
      setTimeout(() => setToast(null), 5_000);
    }
  };

  const flows = data?.recentFlows ?? [];
  const recs  = data?.aiRecs      ?? [];

  return (
    <div style={{ minHeight:'100vh', background:'#0a0a0f', color:'#e2e8f0', fontFamily:'monospace', padding:'24px 20px' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', top:16, right:16, zIndex:9999,
          background:'#052e16', border:'1px solid #16a34a', color:'#86efac',
          borderRadius:8, padding:'10px 16px', fontSize:13, boxShadow:'0 4px 20px #0008',
        }}>{toast}</div>
      )}

      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:20, fontWeight:700, color:'#fbbf24', marginBottom:4 }}>Treasury Intelligence</div>
          <div style={{ fontSize:11, color:'#6b7280' }}>
            GhostBrain-powered treasury analytics · GST supply &amp; flow monitoring
            {data?.timestamp && ` · Updated ${new Date(data.timestamp).toLocaleTimeString()}`}
          </div>
        </div>

        {data?.error && (
          <div style={{ background:'#450a0a', border:'1px solid #dc2626', borderRadius:6, padding:'10px 14px', color:'#fca5a5', fontSize:12, marginBottom:20 }}>
            {data.error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign:'center', color:'#6b7280', padding:60 }}>Loading treasury data…</div>
        ) : (
          <>
            {/* Metrics grid */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 }}>
              <MetricCard label="Total GST Supply" value={gstDisplay(data?.totalGst)}     color="#fbbf24" />
              <MetricCard label="Available GST"    value={gstDisplay(data?.availableGst)} color="#22c55e" />
              <MetricCard label="Locked GST"       value={gstDisplay(data?.lockedGst)}    color="#c4b5fd" />
              {data?.burnRatePerDayGst != null && (
                <MetricCard label="Burn Rate / Day" value={gstDisplay(data.burnRatePerDayGst)} color="#f87171" />
              )}
              {data?.runwayDays != null && (
                <MetricCard
                  label="Treasury Runway"
                  value={`${data.runwayDays} days`}
                  color={data.runwayDays < 90 ? '#ef4444' : '#22c55e'}
                  sub={data.runwayDays < 90 ? '⚠ Low runway' : 'Healthy'}
                />
              )}
            </div>

            {/* Solvency */}
            {data?.solvencyRatio != null && (
              <div style={{ background:'#111827', border:'1px solid #1e1e2e', borderRadius:8, padding:'16px', marginBottom:24 }}>
                <SolvencyBar ratio={data.solvencyRatio} />
                <div style={{ fontSize:10, color:'#4b5563', marginTop:8 }}>
                  Target: ≥1.5x · Critical: &lt;1.0x
                </div>
              </div>
            )}

            {/* Two-column: flows + AI recs */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {/* Recent flows */}
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#9ca3af', marginBottom:10 }}>Recent Flows</div>
                {flows.length === 0 ? (
                  <div style={{ color:'#374151', fontSize:12 }}>No flow history available</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {flows.slice(0, 10).map((fl, i) => {
                      const isIn = fl.direction === 'in';
                      return (
                        <div key={i} style={{
                          background:'#111827', border:'1px solid #1e1e2e', borderRadius:6, padding:'8px 12px',
                          display:'flex', justifyContent:'space-between', alignItems:'center',
                        }}>
                          <div>
                            <span style={{ fontSize:10, color: isIn ? '#22c55e' : '#f87171', marginRight:8, fontWeight:700 }}>
                              {isIn ? '▲ IN' : '▼ OUT'}
                            </span>
                            <span style={{ fontSize:12 }}>{fl.note ?? fl.type ?? '—'}</span>
                          </div>
                          <div style={{ fontSize:12, color: isIn ? '#22c55e' : '#f87171', fontWeight:700 }}>
                            {gstDisplay(fl.amount)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* AI Recommendations */}
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#9ca3af', marginBottom:10 }}>
                  GhostBrain Recommendations
                  <span style={{ fontSize:10, color:'#374151', marginLeft:8 }}>REQUIRES RATIFICATION</span>
                </div>
                {recs.length === 0 ? (
                  <div style={{ color:'#374151', fontSize:12 }}>No recommendations at this time</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {recs.slice(0, 6).map((rec, i) => {
                      const pColor = rec.priority === 'high' ? '#ef4444' : rec.priority === 'medium' ? '#f59e0b' : '#22c55e';
                      return (
                        <div key={i} style={{ background:'#111827', border:'1px solid #1e1e2e', borderRadius:6, padding:'10px 12px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:'#c4b5fd', flex:1 }}>{rec.action ?? '(action)'}</div>
                            <span style={{ fontSize:9, color:pColor, border:`1px solid ${pColor}`, padding:'1px 5px', borderRadius:4, marginLeft:8, textTransform:'uppercase', flexShrink:0 }}>
                              {rec.priority ?? 'low'}
                            </span>
                          </div>
                          {rec.rationale && (
                            <div style={{ fontSize:11, color:'#6b7280', marginBottom:6 }}>{rec.rationale}</div>
                          )}
                          {rec.impact && (
                            <div style={{ fontSize:10, color:'#4b5563', marginBottom:8 }}>Impact: {rec.impact}</div>
                          )}
                          <button
                            onClick={() => void approveRec(rec, i)}
                            disabled={approving === String(i)}
                            style={{
                              background:'#1c1917', border:'1px solid #fbbf2466', color:'#fbbf24',
                              padding:'3px 10px', borderRadius:4, cursor:'pointer', fontSize:11, fontWeight:600,
                            }}
                          >
                            {approving === String(i) ? 'Forwarding…' : '⟳ Forward to Governance'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
