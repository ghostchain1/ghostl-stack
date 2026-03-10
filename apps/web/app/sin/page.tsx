'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GovernanceDraft {
  id: string;
  category: string;
  title: string;
  summary: string;
  confidence: number;
  draftedAt: number;
}

interface GstPolicy {
  inflationRatePct: number;
  targetInflationPct: number;
  burnRatePct: number;
  recommendation: string;
  rationale: string;
  proposedAdjustmentPct: number;
}

interface TreasuryEntry {
  purpose: string;
  currentPct: number;
  proposedPct: number;
  rationale: string;
}

interface TreasuryAllocation {
  totalTreasuryGst: string;
  expectedAnnualYieldPct: number;
  allocations: TreasuryEntry[];
}

interface ProtocolProposal {
  id: string;
  upgradeType: string;
  description: string;
  targetChain: string;
  riskLevel: string;
  estimatedImpact: string;
  requiresGovernanceQuorum: number;
}

interface LearningEvent {
  id: string;
  type: string;
  regionId: string;
  description: string;
  confidence: number;
  ts: number;
}

interface VoteAdvice {
  proposalId: string;
  title: string;
  recommendation: 'support' | 'oppose' | 'abstain';
  confidence: number;
  reason: string;
  advisedAt: number;
}

interface LiquidityRoute {
  id: string;
  from: string;
  to: string;
  amountGst: string;
  reason: string;
}

interface LiquidityPolicy {
  l1LiquidityPct: number;
  l2LiquidityPct: number;
  l3LiquidityPct: number;
  routes: LiquidityRoute[];
  analysedAt: number;
}

interface UpgradeBlueprint {
  id: string;
  upgradeType: string;
  targetChain: string;
  migrationSteps: string[];
  rollbackPlan: string;
  estimatedWindowHours: number;
  riskMitigation: string;
  createdAt: number;
}

interface SecurityPolicy {
  id: string;
  domain: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  policyUpdate: string;
  evaluatedAt: number;
}

interface SINSnapshot {
  cycleAt: number;
  governanceDrafts: GovernanceDraft[];
  gstPolicy: GstPolicy | null;
  treasuryAllocation: TreasuryAllocation | null;
  protocolProposals: ProtocolProposal[];
  learningEvents: LearningEvent[];
  recentLearningEvents: LearningEvent[];
  voteAdvice: VoteAdvice[];
  liquidityPolicy: LiquidityPolicy | null;
  upgradeBlueprints: UpgradeBlueprint[];
  securityPolicies: SecurityPolicy[];
  totalProposals: number;
  dryRun: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceBar(v: number): string {
  const filled = Math.round(v * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function recColor(r: string): string {
  if (r === 'increase-burn')     return '#22c55e';
  if (r === 'decrease-issuance') return '#f59e0b';
  if (r === 'stable')            return '#6b7280';
  return '#6366f1';
}

function riskColor(r: string): string {
  if (r === 'high')   return '#ef4444';
  if (r === 'medium') return '#f59e0b';
  return '#22c55e';
}

function shortGst(raw: string): string {
  try {
    const gst = Number(BigInt(raw)) / 1e18;
    if (gst >= 1_000_000) return `${(gst / 1_000_000).toFixed(2)}M GST`;
    if (gst >= 1_000)     return `${(gst / 1_000).toFixed(2)}k GST`;
    return `${gst.toFixed(4)} GST`;
  } catch {
    return raw;
  }
}

function learnIcon(t: string): string {
  if (t === 'pattern-discovered') return '🔍';
  if (t === 'anomaly-flagged')    return '⚠️';
  if (t === 'model-updated')      return '🧠';
  return '📡';
}

function voteColor(r: string): string {
  if (r === 'support') return '#22c55e';
  if (r === 'oppose')  return '#ef4444';
  return '#6b7280';
}

function severityColor(s: string): string {
  if (s === 'critical') return '#ef4444';
  if (s === 'high')     return '#f59e0b';
  if (s === 'medium')   return '#6366f1';
  return '#22c55e';
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SINPage() {
  const [status, setStatus] = useState<SINSnapshot | 'loading' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch('/api/sin/status');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as SINSnapshot;
        if (active) setStatus(data);
      } catch {
        if (active) setStatus('error');
      }
    }
    poll();
    const id = setInterval(poll, 20_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  if (status === 'loading') return <div style={S.centered}>Connecting to Sovereign Intelligence Network…</div>;
  if (status === 'error')   return <div style={S.centered}>SIN service offline — retrying every 20 s</div>;

  const { governanceDrafts, gstPolicy, treasuryAllocation, protocolProposals,
          recentLearningEvents, voteAdvice, liquidityPolicy, upgradeBlueprints,
          securityPolicies, cycleAt, dryRun, totalProposals } = status;

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>🧠 GhostBrain Sovereign Intelligence Network</h1>
          <p style={S.subtitle}>
            AI governance drafting · GST economic policy · Treasury advisory · Protocol evolution · Distributed AI learning
          </p>
        </div>
        <div style={S.meta}>
          {dryRun && <span style={S.dryBadge}>DRY RUN</span>}
          <span style={S.ts}>Last cycle: {new Date(cycleAt).toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Strip */}
      <div style={S.strip}>
        <Pill label="Gov Drafts"       value={String(governanceDrafts.length)} color="#a78bfa" />
        <Pill label="GST Policy"       value={gstPolicy?.recommendation ?? 'none'} color={gstPolicy ? recColor(gstPolicy.recommendation) : '#6b7280'} />
        <Pill label="Vote Advice"      value={String(voteAdvice?.length ?? 0)} color="#22d3ee" />
        <Pill label="Liq Routes"       value={String(liquidityPolicy?.routes.length ?? 0)} color="#f59e0b" />
        <Pill label="Blueprints"       value={String(upgradeBlueprints?.length ?? 0)} color="#38bdf8" />
        <Pill label="Security Alerts"  value={String((securityPolicies ?? []).filter((s) => s.severity === 'high' || s.severity === 'critical').length)} color="#ef4444" />
        <Pill label="Protocol Props"   value={String(protocolProposals.length)} color="#6366f1" />
        <Pill label="Proposals Sent"   value={String(totalProposals)} color={totalProposals > 0 ? '#a78bfa' : '#6b7280'} />
      </div>

      {/* Governance drafts */}
      <Sec title={`AI Governance Drafts (${governanceDrafts.length})`}>
        {governanceDrafts.length === 0 ? (
          <div style={S.dim}>No governance drafts this cycle</div>
        ) : (
          <div style={S.draftGrid}>
            {governanceDrafts.map((d) => (
              <div key={d.id} style={S.draftCard}>
                <div style={S.draftCategory}>{d.category}</div>
                <div style={S.draftTitle}>{d.title}</div>
                <div style={S.draftSummary}>{d.summary}</div>
                <div style={S.draftMeta}>
                  <span style={{ fontFamily: 'monospace', color: '#a78bfa' }}>
                    {confidenceBar(d.confidence)} {Math.round(d.confidence * 100)}%
                  </span>
                  <span style={S.dim}>{new Date(d.draftedAt).toLocaleTimeString()}</span>
                </div>
                <div style={S.ratifBadge}>⚖ Requires human ratification</div>
              </div>
            ))}
          </div>
        )}
      </Sec>

      {/* GST Policy */}
      <Sec title="GST Economic Policy">
        {!gstPolicy ? (
          <div style={S.dim}>Tokenomics API offline — policy unavailable</div>
        ) : (
          <div style={S.twoCol}>
            <div style={S.card}>
              <div style={S.cardRow}><span style={S.cl}>Inflation</span><span>{gstPolicy.inflationRatePct.toFixed(2)}%</span></div>
              <div style={S.cardRow}><span style={S.cl}>Target</span><span>{gstPolicy.targetInflationPct.toFixed(2)}%</span></div>
              <div style={S.cardRow}><span style={S.cl}>Burn rate</span><span>{gstPolicy.burnRatePct.toFixed(2)}%</span></div>
              <div style={S.cardRow}>
                <span style={S.cl}>Recommendation</span>
                <span style={{ color: recColor(gstPolicy.recommendation), fontWeight: 700 }}>{gstPolicy.recommendation}</span>
              </div>
              {gstPolicy.proposedAdjustmentPct !== 0 && (
                <div style={S.cardRow}>
                  <span style={S.cl}>Adjustment</span>
                  <span style={{ color: '#f59e0b' }}>{gstPolicy.proposedAdjustmentPct > 0 ? '+' : ''}{gstPolicy.proposedAdjustmentPct.toFixed(3)}pp</span>
                </div>
              )}
            </div>
            <div style={S.card}>
              <div style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.6 }}>{gstPolicy.rationale}</div>
            </div>
          </div>
        )}
      </Sec>

      {/* Treasury allocation */}
      <Sec title="Treasury Allocation Advisory">
        {!treasuryAllocation ? (
          <div style={S.dim}>Treasury API offline</div>
        ) : (
          <>
            <div style={{ ...S.cardRow, marginBottom: 12 }}>
              <span style={S.cl}>Total Treasury</span>
              <span style={{ color: '#a78bfa', fontWeight: 700 }}>{shortGst(treasuryAllocation.totalTreasuryGst)}</span>
              <span style={{ ...S.cl, marginLeft: 24 }}>Expected yield</span>
              <span>{treasuryAllocation.expectedAnnualYieldPct.toFixed(2)}% / yr</span>
            </div>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Purpose</th><th style={S.th}>Current</th><th style={S.th}>Target</th><th style={S.th}>Delta</th><th style={S.th}>Rationale</th>
              </tr></thead>
              <tbody>
                {treasuryAllocation.allocations.map((a) => {
                  const delta = a.proposedPct - a.currentPct;
                  return (
                    <tr key={a.purpose}>
                      <td style={S.td}>{a.purpose}</td>
                      <td style={S.td}>{a.currentPct.toFixed(1)}%</td>
                      <td style={S.td}>{a.proposedPct.toFixed(1)}%</td>
                      <td style={{ ...S.td, color: delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#6b7280', fontWeight: 600 }}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(1)}pp
                      </td>
                      <td style={{ ...S.td, color: '#71717a' }}>{a.rationale}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </Sec>

      {/* Protocol upgrades */}
      <Sec title={`Protocol Upgrade Proposals (${protocolProposals.length})`}>
        {protocolProposals.length === 0 ? (
          <div style={S.dim}>No protocol upgrades proposed</div>
        ) : (
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Type</th><th style={S.th}>Chain</th><th style={S.th}>Risk</th>
              <th style={S.th}>Quorum</th><th style={S.th}>Description</th>
            </tr></thead>
            <tbody>
              {protocolProposals.map((p) => (
                <tr key={p.id}>
                  <td style={S.td}>{p.upgradeType}</td>
                  <td style={S.td}>{p.targetChain}</td>
                  <td style={{ ...S.td, color: riskColor(p.riskLevel), fontWeight: 700 }}>{p.riskLevel}</td>
                  <td style={S.td}>{Math.round(p.requiresGovernanceQuorum * 100)}%</td>
                  <td style={S.td}>{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sec>

      {/* Vote advisor */}
      <Sec title={`AI Voting Advisor (${(voteAdvice ?? []).length} active proposals)`}>
        {!(voteAdvice ?? []).length ? (
          <div style={S.dim}>No active governance proposals to advise on</div>
        ) : (
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Proposal</th><th style={S.th}>Recommendation</th>
              <th style={S.th}>Confidence</th><th style={S.th}>Reason</th>
            </tr></thead>
            <tbody>
              {(voteAdvice ?? []).map((v) => (
                <tr key={v.proposalId}>
                  <td style={S.td}>{v.title}</td>
                  <td style={{ ...S.td, color: voteColor(v.recommendation), fontWeight: 700, textTransform: 'uppercase' }}>{v.recommendation}</td>
                  <td style={S.td}>{Math.round(v.confidence * 100)}%</td>
                  <td style={{ ...S.td, color: '#a1a1aa' }}>{v.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sec>

      {/* Liquidity policy */}
      <Sec title="Liquidity Distribution & Routing">
        {!liquidityPolicy ? (
          <div style={S.dim}>Chain metrics unavailable — liquidity analysis pending</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
              {(['L1', 'L2', 'L3'] as const).map((layer) => {
                const pct = layer === 'L1' ? liquidityPolicy.l1LiquidityPct
                          : layer === 'L2' ? liquidityPolicy.l2LiquidityPct
                          : liquidityPolicy.l3LiquidityPct;
                return (
                  <div key={layer} style={S.pill}>
                    <div style={{ ...S.pillVal, color: '#f59e0b' }}>{pct.toFixed(1)}%</div>
                    <div style={S.pillLabel}>{layer} Liquidity</div>
                  </div>
                );
              })}
            </div>
            {liquidityPolicy.routes.length === 0 ? (
              <div style={S.dim}>Distribution within policy bounds — no routing needed</div>
            ) : (
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>From</th><th style={S.th}>To</th>
                  <th style={S.th}>Amount</th><th style={S.th}>Reason</th>
                </tr></thead>
                <tbody>
                  {liquidityPolicy.routes.map((r) => (
                    <tr key={r.id}>
                      <td style={{ ...S.td, color: '#f59e0b', fontWeight: 700 }}>{r.from}</td>
                      <td style={{ ...S.td, color: '#22c55e', fontWeight: 700 }}>{r.to}</td>
                      <td style={S.td}>{shortGst(r.amountGst)}</td>
                      <td style={{ ...S.td, color: '#a1a1aa' }}>{r.reason.slice(0, 80)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Sec>

      {/* Security policies */}
      <Sec title="Security Policy Evaluation">
        {!(securityPolicies ?? []).length ? (
          <div style={S.dim}>Security evaluation pending</div>
        ) : (
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Domain</th><th style={S.th}>Severity</th>
              <th style={S.th}>Finding</th><th style={S.th}>Policy Update</th>
            </tr></thead>
            <tbody>
              {(securityPolicies ?? []).map((s) => (
                <tr key={s.id}>
                  <td style={S.td}>{s.domain}</td>
                  <td style={{ ...S.td, color: severityColor(s.severity), fontWeight: 700, textTransform: 'uppercase' }}>{s.severity}</td>
                  <td style={{ ...S.td, color: '#d4d4d8' }}>{s.description.slice(0, 70)}{s.description.length > 70 ? '…' : ''}</td>
                  <td style={{ ...S.td, color: '#a1a1aa' }}>{s.policyUpdate.slice(0, 80)}{s.policyUpdate.length > 80 ? '…' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sec>

      {/* Upgrade blueprints */}
      <Sec title={`Upgrade Blueprints (${(upgradeBlueprints ?? []).length})`}>
        {!(upgradeBlueprints ?? []).length ? (
          <div style={S.dim}>No upgrade blueprints this cycle</div>
        ) : (
          (upgradeBlueprints ?? []).map((bp) => (
            <div key={bp.id} style={{ ...S.card, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: '#38bdf8' }}>{bp.upgradeType}</span>
                <span style={S.cl}>{bp.targetChain} · {bp.estimatedWindowHours}h window</span>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#71717a', marginBottom: 4 }}>Migration steps</div>
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  {bp.migrationSteps.map((step, i) => (
                    <li key={i} style={{ fontSize: 12, color: '#d4d4d8', marginBottom: 2 }}>{step}</li>
                  ))}
                </ol>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#71717a', marginBottom: 2 }}>Rollback</div>
                  <div style={{ fontSize: 12, color: '#a1a1aa' }}>{bp.rollbackPlan.slice(0, 100)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#71717a', marginBottom: 2 }}>Risk mitigation</div>
                  <div style={{ fontSize: 12, color: '#a1a1aa' }}>{bp.riskMitigation.slice(0, 100)}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </Sec>

      {/* Distributed AI learning */}
      <Sec title="Distributed AI Learning Bus">
        {recentLearningEvents.length === 0 ? (
          <div style={S.dim}>No learning events yet</div>
        ) : (
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Event</th><th style={S.th}>Region</th>
              <th style={S.th}>Type</th><th style={S.th}>Confidence</th><th style={S.th}>Time</th>
            </tr></thead>
            <tbody>
              {recentLearningEvents.slice().reverse().map((e) => (
                <tr key={e.id}>
                  <td style={S.td}>{learnIcon(e.type)} {e.description.slice(0, 60)}{e.description.length > 60 ? '…' : ''}</td>
                  <td style={S.td}>{e.regionId}</td>
                  <td style={S.td}>{e.type}</td>
                  <td style={S.td}>{Math.round(e.confidence * 100)}%</td>
                  <td style={S.td}>{new Date(e.ts).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sec>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={S.pill}>
      <div style={{ ...S.pillVal, color }}>{value}</div>
      <div style={S.pillLabel}>{label}</div>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={S.sec}>
      <h2 style={S.secTitle}>{title}</h2>
      {children}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page:      { fontFamily: 'monospace', background: '#09090b', color: '#f4f4f5', minHeight: '100vh', padding: '24px 32px' },
  centered:  { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#a1a1aa' },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title:     { fontSize: 26, fontWeight: 700, margin: 0, color: '#e4e4e7' },
  subtitle:  { fontSize: 13, color: '#71717a', marginTop: 6 },
  meta:      { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' },
  ts:        { fontSize: 12, color: '#52525b' },
  dryBadge:  { background: '#854d0e', color: '#fef3c7', fontSize: 11, padding: '2px 8px', borderRadius: 4 },
  strip:     { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 },
  pill:      { background: '#18181b', border: '1px solid #27272a', borderRadius: 8, padding: '12px 18px', minWidth: 130 },
  pillVal:   { fontSize: 20, fontWeight: 700 },
  pillLabel: { fontSize: 11, color: '#71717a', marginTop: 4 },
  sec:       { marginBottom: 36 },
  secTitle:  { fontSize: 16, fontWeight: 600, color: '#a1a1aa', marginBottom: 14, borderBottom: '1px solid #27272a', paddingBottom: 6 },
  twoCol:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  card:      { background: '#18181b', border: '1px solid #27272a', borderRadius: 10, padding: '16px 20px' },
  cardRow:   { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid #27272a' },
  cl:        { color: '#71717a' },
  draftGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 },
  draftCard: { background: '#18181b', border: '1px solid #27272a', borderRadius: 10, padding: 16 },
  draftCategory: { fontSize: 10, color: '#a78bfa', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  draftTitle: { fontSize: 14, fontWeight: 700, color: '#e4e4e7', marginBottom: 8 },
  draftSummary: { fontSize: 12, color: '#a1a1aa', lineHeight: 1.5, marginBottom: 10 },
  draftMeta: { display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 },
  ratifBadge: { fontSize: 10, color: '#6b7280', borderTop: '1px solid #27272a', paddingTop: 6 },
  dim:       { color: '#71717a', fontSize: 13 },
  table:     { borderCollapse: 'collapse', width: '100%', fontSize: 12 },
  th:        { textAlign: 'left', color: '#52525b', padding: '5px 10px', borderBottom: '1px solid #27272a', fontWeight: 600 },
  td:        { padding: '5px 10px', borderBottom: '1px solid #1c1c1e', color: '#d4d4d8' },
};
