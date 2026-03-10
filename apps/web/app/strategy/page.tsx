'use client';

/**
 * GhostBrain Strategic Intelligence Dashboard (Phases 83-100)
 *
 * Displays the live output of the GhostBrain Strategic Intelligence System:
 *   - Network, gas, and validator load forecasts
 *   - Treasury and tokenomics projections
 *   - Cross-chain liquidity routing status
 *   - Bridge health and optimization
 *   - Chain scaling + node expansion plans
 *   - Actionable governance proposals (Approve / Reject — no auto-execute)
 *
 * Data: polls /api/strategy/status every 20 s.
 *
 * GOVERNANCE MODEL:
 *   All proposals are forwarded to the signing relay.
 *   Validators must ratify via governance — the SIS never deploys autonomously.
 */

import { useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

type RiskLevel    = 'low' | 'moderate' | 'high' | 'critical';
type EnginePhase  = 'idle' | 'forecasting' | 'modeling' | 'routing' | 'scaling' | 'proposing';
type ProposalStatus = 'pending' | 'submitted' | 'dry_run' | 'submit_failed';

interface ForecastResult {
  metric:          string;
  value:           number;
  level:           RiskLevel;
  detail:          string;
  recommendation?: string;
  ts:              string;
}

interface TokenomicsSnapshot {
  supply:          number;
  circulatingPct:  number;
  burnRate:        number;
  stakingAPR:      number;
  inflationRate:   number;
  burnRecommended: boolean;
  burnDeltaRec?:   number;
}

interface TreasuryProjection {
  gstReserve:          number;
  projectedRevenue:    number;
  projectedExpenses:   number;
  liquidityShortfall:  number;
  stakingRewards:      number;
  recommendation?:     string;
}

interface RoutingResult {
  l1Pct:   number;
  l2Pct:   number;
  l3Pct:   number;
  optimal: boolean;
  actions: string[];
}

interface BridgeResult {
  l1l2LatencyMs: number;
  l2l3LatencyMs: number;
  congestionPct: number;
  actions:       string[];
}

interface ScalingPlan {
  currentLoadPct:  number;
  projectedLoadPct:number;
  recommendAction: boolean;
  action?:         string;
}

interface NodeExpansionPlan {
  rpcNodeCount:    number;
  validatorCount:  number;
  archiveNodeCount:number;
  expansion:       string[];
}

interface StrategySnapshot {
  networkForecast:   ForecastResult;
  gasForecast:       ForecastResult;
  validatorForecast: ForecastResult;
  treasuryForecast:  TreasuryProjection;
  routingResult:     RoutingResult;
  bridgeResult:      BridgeResult;
  scalingPlan:       ScalingPlan;
  nodeExpansion:     NodeExpansionPlan;
  tokenomics:        TokenomicsSnapshot;
  recommendations:   string[];
  riskLevel:         RiskLevel;
  generatedAt:       string;
}

interface StrategyProposal {
  id:          string;
  title:       string;
  description: string;
  risk:        RiskLevel;
  action:      string;
  module:      string;
  status:      ProposalStatus;
  createdAt:   string;
}

interface SISStatus {
  phase:              EnginePhase;
  cycleCount:         number;
  forecastsRun:       number;
  proposalsGenerated: number;
  proposalsSubmitted: number;
  proposalsFailed:    number;
  lastCycleAt:        string | null;
  currentSnapshot:    StrategySnapshot | null;
  recentProposals:    StrategyProposal[];
  dryRun:             boolean;
  cycleIntervalMs:    number;
  ts:                 string;
  error?:             string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RISK_COLOR: Record<RiskLevel, string> = {
  low:      '#22c55e',
  moderate: '#f59e0b',
  high:     '#ef4444',
  critical: '#dc2626',
};

const RISK_BG: Record<RiskLevel, string> = {
  low:      'rgba(34,197,94,0.12)',
  moderate: 'rgba(245,158,11,0.12)',
  high:     'rgba(239,68,68,0.12)',
  critical: 'rgba(220,38,38,0.18)',
};

const PHASE_LABEL: Record<EnginePhase, string> = {
  idle:        '○ Idle',
  forecasting: '⟳ Forecasting',
  modeling:    '⟳ Economic Modeling',
  routing:     '⟳ Routing Optimization',
  scaling:     '⟳ Scaling Planning',
  proposing:   '⟳ Generating Proposals',
};

const STATUS_COLOR: Record<ProposalStatus, string> = {
  pending:      '#6b7280',
  submitted:    '#22c55e',
  dry_run:      '#f59e0b',
  submit_failed:'#ef4444',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function gst(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M GST`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K GST`;
  return `${n.toFixed(0)} GST`;
}

function pct(n: number): string { return `${n.toFixed(1)}%`; }

function ago(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span style={{
      background: RISK_BG[level],
      color:  RISK_COLOR[level],
      border: `1px solid ${RISK_COLOR[level]}44`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 12,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      {level}
    </span>
  );
}

function ForecastCard({ f }: { f: ForecastResult }) {
  return (
    <div style={{
      background: RISK_BG[f.level],
      border: `1px solid ${RISK_COLOR[f.level]}33`,
      borderRadius: 8,
      padding: '12px 16px',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
          {f.metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </span>
        <RiskBadge level={f.level} />
      </div>
      <div style={{ display:'flex', gap: 12, alignItems:'center', marginBottom: 6 }}>
        <div style={{ flex: 1, height: 6, background: '#1e293b', borderRadius: 3 }}>
          <div style={{ width: `${f.value}%`, height: '100%', background: RISK_COLOR[f.level], borderRadius: 3, transition: 'width 0.6s' }} />
        </div>
        <span style={{ color: RISK_COLOR[f.level], fontWeight: 700, fontSize: 18, minWidth: 48, textAlign: 'right' }}>
          {f.value}%
        </span>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>{f.detail}</p>
      {f.recommendation && (
        <p style={{ color: '#fbbf24', fontSize: 12, marginTop: 6, marginBottom: 0 }}>
          ⚡ {f.recommendation}
        </p>
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 6, padding: '8px 14px', textAlign: 'center', minWidth: 90 }}>
      <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 18, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const ZERO: SISStatus = {
  phase: 'idle', cycleCount: 0, forecastsRun: 0, proposalsGenerated: 0,
  proposalsSubmitted: 0, proposalsFailed: 0, lastCycleAt: null,
  currentSnapshot: null, recentProposals: [], dryRun: false,
  cycleIntervalMs: 120_000, ts: new Date().toISOString(),
};

export default function StrategyPage() {
  const [status, setStatus] = useState<SISStatus>(ZERO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function poll() {
      try {
        const r = await fetch('/api/strategy/status');
        if (r.ok) setStatus(await r.json());
      } catch { /* offline — retain last state */ }
      finally   { setLoading(false); }
    }
    poll();
    const t = setInterval(poll, 20_000);
    return () => clearInterval(t);
  }, []);

  const snap = status.currentSnapshot;
  const online = !status.error;

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', color: '#e2e8f0', fontFamily: 'monospace', padding: 24 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f8fafc' }}>
            GhostBrain Strategic Intelligence
          </h1>
          {snap && <RiskBadge level={snap.riskLevel} />}
          {status.dryRun && (
            <span style={{ background: '#fbbf2422', color: '#fbbf24', border: '1px solid #fbbf2444', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>
              DRY RUN
            </span>
          )}
        </div>
        <div style={{ color: '#475569', fontSize: 12 }}>
          {online ? `● Online · ${PHASE_LABEL[status.phase]}` : '○ Offline'} · cycle #{status.cycleCount} · last {ago(status.lastCycleAt)} · interval {status.cycleIntervalMs / 1000}s
        </div>
      </div>

      {loading && <p style={{ color: '#475569' }}>Connecting to Strategic Intelligence System…</p>}
      {!loading && status.error && (
        <div style={{ background: '#1e293b', border: '1px solid #ef444433', borderRadius: 8, padding: 16, marginBottom: 20, color: '#f87171' }}>
          {status.error}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
        <StatPill label="Cycles"       value={status.cycleCount} />
        <StatPill label="Forecasts"    value={status.forecastsRun} />
        <StatPill label="Proposals"    value={status.proposalsGenerated} />
        <StatPill label="Submitted"    value={status.proposalsSubmitted} />
        <StatPill label="Failed"       value={status.proposalsFailed} />
      </div>

      {snap && (
        <>
          {/* Forecasting */}
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ color: '#94a3b8', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
              Network Forecasting
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              <ForecastCard f={snap.networkForecast} />
              <ForecastCard f={snap.gasForecast} />
              <ForecastCard f={snap.validatorForecast} />
            </div>
          </section>

          {/* Economics */}
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ color: '#94a3b8', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
              Economic Intelligence
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Tokenomics */}
              <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, border: '1px solid #334155' }}>
                <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>GST Tokenomics</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                  {[
                    ['Supply',       `${(snap.tokenomics.supply / 1e9).toFixed(2)}B GST`],
                    ['Circulating',  pct(snap.tokenomics.circulatingPct)],
                    ['Burn Rate',    `${snap.tokenomics.burnRate}%/yr`],
                    ['Staking APR',  pct(snap.tokenomics.stakingAPR)],
                    ['Net Inflation',pct(snap.tokenomics.inflationRate)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <span style={{ color: '#64748b' }}>{k}: </span>
                      <span style={{ color: '#e2e8f0' }}>{v}</span>
                    </div>
                  ))}
                </div>
                {snap.tokenomics.burnRecommended && snap.tokenomics.burnDeltaRec && (
                  <div style={{ marginTop: 12, padding: '8px 12px', background: '#ef444415', borderRadius: 6, border: '1px solid #ef444433', color: '#fca5a5', fontSize: 12 }}>
                    ⚠ Inflation rising — recommend burn rate +{snap.tokenomics.burnDeltaRec}% via governance
                  </div>
                )}
              </div>

              {/* Treasury */}
              <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, border: '1px solid #334155' }}>
                <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>30-Day Treasury Projection</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                  {[
                    ['Reserve',     gst(snap.treasuryForecast.gstReserve)],
                    ['Revenue',     gst(snap.treasuryForecast.projectedRevenue)],
                    ['Expenses',    gst(snap.treasuryForecast.projectedExpenses)],
                    ['Staking Out', gst(snap.treasuryForecast.stakingRewards)],
                    ['Shortfall',   pct(snap.treasuryForecast.liquidityShortfall)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <span style={{ color: '#64748b' }}>{k}: </span>
                      <span style={{ color: snap.treasuryForecast.liquidityShortfall > 10 && k === 'Shortfall' ? '#f87171' : '#e2e8f0' }}>{v}</span>
                    </div>
                  ))}
                </div>
                {snap.treasuryForecast.recommendation && (
                  <div style={{ marginTop: 12, color: '#fbbf24', fontSize: 12 }}>
                    ⚡ {snap.treasuryForecast.recommendation}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Routing + Bridge */}
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ color: '#94a3b8', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
              Liquidity &amp; Bridge Routing
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, border: '1px solid #334155' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontWeight: 600, color: '#e2e8f0' }}>Cross-Chain Liquidity</span>
                  <span style={{ color: snap.routingResult.optimal ? '#22c55e' : '#f59e0b', fontSize: 12 }}>
                    {snap.routingResult.optimal ? '✓ Optimal' : '⚠ Imbalanced'}
                  </span>
                </div>
                {(['L1','L2','L3'] as const).map((l, i) => {
                  const pctVal = [snap.routingResult.l1Pct, snap.routingResult.l2Pct, snap.routingResult.l3Pct][i];
                  const target = [50, 30, 20][i];
                  return (
                    <div key={l} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                        <span style={{ color: '#94a3b8' }}>{l}</span>
                        <span style={{ color: Math.abs(pctVal - target) > 10 ? '#f59e0b' : '#e2e8f0' }}>
                          {pctVal}% <span style={{ color: '#4b5563' }}>(target {target}%)</span>
                        </span>
                      </div>
                      <div style={{ height: 5, background: '#0f172a', borderRadius: 3 }}>
                        <div style={{ width: `${pctVal}%`, height: '100%', background: '#6366f1', borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
                {snap.routingResult.actions.length > 0 && (
                  <ul style={{ margin: '10px 0 0', padding: '0 0 0 16px', color: '#fbbf24', fontSize: 12 }}>
                    {snap.routingResult.actions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                )}
              </div>

              <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, border: '1px solid #334155' }}>
                <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>Bridge Health</div>
                {[
                  { label: 'L1 ↔ L2 Latency', ms: snap.bridgeResult.l1l2LatencyMs },
                  { label: 'L2 ↔ L3 Latency', ms: snap.bridgeResult.l2l3LatencyMs },
                ].map(({ label, ms }) => (
                  <div key={label} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                      <span style={{ color: '#94a3b8' }}>{label}</span>
                      <span style={{ color: ms > 5000 ? '#f87171' : '#22c55e' }}>{ms} ms</span>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 13, marginTop: 8 }}>
                  <span style={{ color: '#94a3b8' }}>Congestion: </span>
                  <span style={{ color: snap.bridgeResult.congestionPct > 75 ? '#f87171' : '#e2e8f0' }}>
                    {snap.bridgeResult.congestionPct}%
                  </span>
                </div>
                {snap.bridgeResult.actions.length > 0 && (
                  <ul style={{ margin: '10px 0 0', padding: '0 0 0 16px', color: '#fbbf24', fontSize: 12 }}>
                    {snap.bridgeResult.actions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* Scaling */}
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ color: '#94a3b8', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
              Predictive Scaling
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, border: `1px solid ${snap.scalingPlan.recommendAction ? '#ef444433' : '#334155'}` }}>
                <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>Chain Scaling Planner (L3)</div>
                <div style={{ fontSize: 13, display: 'grid', gap: 6 }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Current Load: </span>
                    <span style={{ color: snap.scalingPlan.currentLoadPct > 80 ? '#f87171' : '#e2e8f0' }}>
                      {snap.scalingPlan.currentLoadPct}%
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Projected (30m): </span>
                    <span style={{ color: snap.scalingPlan.projectedLoadPct > 85 ? '#f87171' : snap.scalingPlan.projectedLoadPct > 70 ? '#f59e0b' : '#22c55e' }}>
                      {snap.scalingPlan.projectedLoadPct}%
                    </span>
                  </div>
                </div>
                {snap.scalingPlan.action && (
                  <div style={{ marginTop: 12, padding: '8px 12px', background: '#ef444415', borderRadius: 6, border: '1px solid #ef444433', color: '#fca5a5', fontSize: 12 }}>
                    ⚠ {snap.scalingPlan.action}
                  </div>
                )}
              </div>

              <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, border: '1px solid #334155' }}>
                <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>Node Expansion Planner</div>
                <div style={{ fontSize: 13, display: 'grid', gap: 6 }}>
                  {[
                    ['RPC Nodes',     snap.nodeExpansion.rpcNodeCount],
                    ['Validators',    snap.nodeExpansion.validatorCount],
                    ['Archive Nodes', snap.nodeExpansion.archiveNodeCount],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <span style={{ color: '#64748b' }}>{k}: </span>
                      <span style={{ color: '#e2e8f0' }}>{v}</span>
                    </div>
                  ))}
                </div>
                {snap.nodeExpansion.expansion.length > 0 && (
                  <ul style={{ margin: '10px 0 0', padding: '0 0 0 16px', color: '#fbbf24', fontSize: 12 }}>
                    {snap.nodeExpansion.expansion.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* Recommendations */}
          {snap.recommendations.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ color: '#94a3b8', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                Strategic Recommendations
              </h2>
              <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, border: '1px solid #334155' }}>
                <ol style={{ margin: 0, padding: '0 0 0 20px', display: 'grid', gap: 8 }}>
                  {snap.recommendations.map((rec, i) => (
                    <li key={i} style={{ color: '#cbd5e1', fontSize: 13 }}>{rec}</li>
                  ))}
                </ol>
              </div>
            </section>
          )}
        </>
      )}

      {/* Governance Proposals */}
      {status.recentProposals.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ color: '#94a3b8', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
            Governance Proposals — Pending Ratification
          </h2>
          <div style={{ background: '#1e293b', borderRadius: 8, padding: '8px 0', border: '1px solid #334155' }}>
            {status.recentProposals.map(p => (
              <div key={p.id} style={{ padding: '12px 16px', borderBottom: '1px solid #0f172a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>{p.title}</span>
                      <RiskBadge level={p.risk} />
                      <span style={{ color: STATUS_COLOR[p.status], fontSize: 11, border: `1px solid ${STATUS_COLOR[p.status]}44`, borderRadius: 4, padding: '1px 6px' }}>
                        {p.status}
                      </span>
                    </div>
                    <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>{p.description}</p>
                    <span style={{ color: '#4b5563', fontSize: 11 }}>
                      {p.module} · {ago(p.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ color: '#4b5563', fontSize: 11, marginTop: 8 }}>
            ⚠ Proposals are submitted to the signing relay for validator governance ratification. No autonomous execution occurs.
          </p>
        </section>
      )}

      {/* Footer */}
      <div style={{ color: '#1e293b', fontSize: 11, borderTop: '1px solid #1e293b', paddingTop: 16, marginTop: 16 }}>
        GhostBrain Strategic Intelligence System · Port 7925 · GhostChain L1 (14000101) · GhostL2 (901) · GhostL3 (903)
      </div>
    </div>
  );
}
