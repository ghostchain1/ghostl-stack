'use client';

/**
 * Autonomous Operations Console (Phases 53-54)
 *
 * Visual command center for the GhostBrain Autonomous Operations Engine.
 * Displays the live proposal queue from ghostbrain-autonomous (port 7921)
 * and strategy recommendations from the AI decision + strategy engines.
 *
 * GOVERNANCE MODEL — enforced in the UI:
 *   Every proposal card shows Approve / Reject.
 *   Approve → POST to /api/hyperghost (signs and routes to the relay for
 *             human-ratified on-chain execution).
 *   Reject  → client-side dismissal only.
 *
 *   There is NO "Auto Execute" button.  The architecture requires a human
 *   in the loop for every write action.
 */

import { useEffect, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProposalSeverity = 'info' | 'warning' | 'critical';
type ProposalStatus   = 'pending' | 'sent' | 'dry_run' | 'send_failed';

interface Proposal {
  id:        string;
  type:      string;
  action:    string;
  target:    string;
  severity:  ProposalSeverity;
  reason:    string;
  payload:   Record<string, unknown>;
  createdAt: string;
  status:    ProposalStatus;
  kernelType?: string;
  source:    string;
}

interface StrategySnapshot {
  validatorTargetLoad:   number;
  treasuryYieldTarget:   number;
  nodeRedundancy:        number;
  generatedAt:           string;
  advice:                string[];
}

interface EngineStatus {
  cycleCount:          number;
  proposalsSent:       number;
  proposalsFailed:     number;
  proposalsDryRun:     number;
  lastCycleAt:         string | null;
  lastCycleDurationMs?: number;
  strategy:            StrategySnapshot | null;
  recentProposals:     Proposal[];
  _offline?:           boolean;
}

// ── Colours ────────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6',
};
const SEV_BG: Record<string, string> = {
  critical: '#450a0a', warning: '#1c0f00', info: '#0c1a2e',
};
const STATUS_COLOR: Record<string, string> = {
  pending: '#6b7280', sent: '#22c55e',
  dry_run: '#a855f7', send_failed: '#ef4444',
};

// ── Sub-components ──────────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: '#111827', border: '1px solid #1e1e2e', borderRadius: 8, padding: '10px 16px' }}>
      <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: color ?? '#e2e8f0' }}>{value}</div>
    </div>
  );
}

function ProposalCard({
  p, approving, onApprove, onReject,
}: {
  p: Proposal;
  approving: boolean;
  onApprove: () => void;
  onReject:  () => void;
}) {
  const c  = SEV_COLOR[p.severity]  ?? '#6b7280';
  const bg = SEV_BG[p.severity]     ?? '#111827';
  const sc = STATUS_COLOR[p.status] ?? '#6b7280';
  return (
    <div style={{
      background: bg, border: `1px solid ${c}44`, borderLeft: `3px solid ${c}`,
      borderRadius: 6, padding: '12px 14px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, color: c, border: `1px solid ${c}`, padding: '1px 6px', borderRadius: 3, fontWeight: 700, textTransform: 'uppercase' }}>
          {p.severity}
        </span>
        <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{p.type}</span>
        <span style={{ fontSize: 10, color: sc, marginLeft: 'auto', fontWeight: 600 }}>{p.status}</span>
        <span style={{ fontSize: 10, color: '#4b5563' }}>
          {new Date(p.createdAt).toLocaleTimeString()}
        </span>
      </div>

      {/* AI Decision box (Phase 53) */}
      <div style={{ background: '#0d1117', border: '1px solid #374151', borderRadius: 4, padding: '8px 10px', marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>AI Decision</div>
        <div style={{ borderBottom: '1px solid #1f2937', marginBottom: 6, paddingBottom: 4, fontSize: 11, color: '#9ca3af' }}>
          Target: <b style={{ color: '#e2e8f0' }}>{p.target}</b>
          {'  '}Action: <b style={{ color: '#e2e8f0' }}>{p.action}</b>
        </div>
        <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 4 }}>{p.reason}</div>
        <div style={{ fontSize: 10, color: '#4b5563' }}>Source: {p.source}</div>
      </div>

      {/* Payload preview */}
      {Object.keys(p.payload).length > 0 && (
        <details style={{ marginBottom: 8 }}>
          <summary style={{ fontSize: 10, color: '#6b7280', cursor: 'pointer' }}>Payload</summary>
          <pre style={{ fontSize: 9, color: '#9ca3af', background: '#0d1117', borderRadius: 4, padding: 8, marginTop: 4, overflow: 'auto' }}>
            {JSON.stringify(p.payload, null, 2)}
          </pre>
        </details>
      )}

      {/* Approve / Reject buttons — Phase 53 (NO auto-execute) */}
      {p.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onApprove}
            disabled={approving}
            style={{
              background: '#052e16', border: '1px solid #16a34a', color: '#86efac',
              padding: '5px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 700,
              opacity: approving ? 0.6 : 1,
            }}
          >
            {approving ? '…' : '✓ Approve'}
          </button>
          <button
            onClick={onReject}
            style={{
              background: '#1c0a0a', border: '1px solid #dc2626', color: '#fca5a5',
              padding: '5px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 700,
            }}
          >
            ✕ Reject
          </button>
          <span style={{ fontSize: 9, color: '#374151', alignSelf: 'center', marginLeft: 4 }}>
            Approval required · no auto-execute
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AutonomousPage() {
  const [status,    setStatus]    = useState<EngineStatus | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [toast,     setToast]     = useState<string | null>(null);
  const [filter,    setFilter]    = useState<'all' | 'critical' | 'warning' | 'pending'>('all');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5_000);
  };

  const fetchStatus = async () => {
    try {
      const r    = await fetch('/api/autonomous/status');
      const data = await r.json() as EngineStatus;
      setStatus(data);
      setProposals(prev => {
        // Merge: keep local status overrides (rejected) but add new proposals
        const existingIds = new Set(prev.map(p => p.id));
        const newOnes = (data.recentProposals ?? []).filter(p => !existingIds.has(p.id));
        return [...newOnes, ...prev].slice(0, 200);
      });
    } catch {
      /* swallow — engine offline is handled by _offline flag */
    }
  };

  useEffect(() => {
    void fetchStatus();
    timerRef.current = setInterval(fetchStatus, 15_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleApprove = async (p: Proposal) => {
    setApproving(prev => new Set(prev).add(p.id));
    try {
      const r = await fetch('/api/hyperghost', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type:        p.kernelType ?? 'alert',
          action:      p.action,
          target:      p.target,
          requestedBy: 'ui-operator',
          params:      p.payload,
          proposalId:  p.id,
          reason:      p.reason,
        }),
      });
      if (r.ok) {
        setProposals(prev => prev.map(x => x.id === p.id ? { ...x, status: 'sent' as ProposalStatus } : x));
        showToast(`Approved: "${p.reason.slice(0, 60)}…" — forwarded to governance relay`);
      } else {
        showToast('Approval failed — check governance relay connectivity');
      }
    } catch {
      showToast('Approval failed — could not reach /api/hyperghost');
    } finally {
      setApproving(prev => { const s = new Set(prev); s.delete(p.id); return s; });
    }
  };

  const handleReject = (id: string) => {
    setProposals(prev => prev.filter(p => p.id !== id));
    showToast('Proposal rejected and removed from queue');
  };

  const visible = proposals.filter(p => {
    if (filter === 'critical') return p.severity === 'critical';
    if (filter === 'warning')  return p.severity === 'warning';
    if (filter === 'pending')  return p.status   === 'pending';
    return true;
  });

  const critCount    = proposals.filter(p => p.severity === 'critical').length;
  const pendingCount = proposals.filter(p => p.status   === 'pending').length;
  const offline      = status?._offline ?? status === null;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e2e8f0', fontFamily: 'monospace' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, background: '#052e16', border: '1px solid #16a34a', color: '#86efac', borderRadius: 8, padding: '10px 16px', fontSize: 13/*, maxWidth: 360*/ }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#a855f7' }}>GhostBrain Autonomous Engine</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                Detect-and-Propose · All writes require human governance ratification
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: offline ? '#ef4444' : '#22c55e' }} />
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                {offline ? 'Engine offline' : 'Engine active'}
              </span>
            </div>
          </div>
        </div>

        {/* Phase 54 — Stats dashboard */}
        {status && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 24 }}>
            <StatBox label="GhostBrain Status"     value={offline ? 'OFFLINE' : 'ACTIVE'}     color={offline ? '#ef4444' : '#22c55e'} />
            <StatBox label="Autonomous Cycles"     value={status.cycleCount}                  color="#c4b5fd" />
            <StatBox label="Proposals Forwarded"   value={status.proposalsSent}                color="#22c55e" />
            <StatBox label="Pending Approval"      value={pendingCount}                        color={pendingCount > 0 ? '#f59e0b' : '#22c55e'} />
            <StatBox label="Failed Sends"          value={status.proposalsFailed}              color={status.proposalsFailed > 0 ? '#ef4444' : '#6b7280'} />
          </div>
        )}

        {/* AI Architecture overview (Phase 55) */}
        <div style={{ background: '#111827', border: '1px solid #1e1e2e', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 11, color: '#6b7280' }}>
          <div style={{ fontWeight: 700, color: '#9ca3af', marginBottom: 8 }}>Control Architecture (Phase 55)</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {[
              { label: 'Web UI', color: '#c4b5fd' },
              { label: '↓', color: '#374151' },
              { label: 'GhostBrain Autonomous Engine', color: '#a855f7' },
              { label: '↓', color: '#374151' },
              { label: 'GhostStack Services', color: '#3b82f6' },
              { label: '↓', color: '#374151' },
              { label: 'L1 · L2 · L3', color: '#22c55e' },
              { label: '·', color: '#374151' },
              { label: 'Validators', color: '#22c55e' },
              { label: '·', color: '#374151' },
              { label: 'Docker', color: '#22c55e' },
              { label: '·', color: '#374151' },
              { label: 'Treasury', color: '#fbbf24' },
            ].map((item, i) => (
              <span key={i} style={{ color: item.color, fontWeight: item.label === '↓' ? 400 : 600 }}>
                {item.label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
          {/* Proposal queue */}
          <div>
            {/* Filter bar */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af' }}>Proposal Queue</span>
              <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                {(['all', 'pending', 'critical', 'warning'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      background:  filter === f ? '#1e1035' : '#111827',
                      border:      `1px solid ${filter === f ? '#7c3aed' : '#374151'}`,
                      color:       filter === f ? '#c4b5fd' : '#6b7280',
                      padding:     '2px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                    }}
                  >
                    {f === 'all'
                      ? `All (${proposals.length})`
                      : f === 'critical'
                        ? `Critical (${critCount})`
                        : f === 'pending'
                          ? `Pending (${pendingCount})`
                          : `Warning (${proposals.filter(p => p.severity === 'warning').length})`}
                  </button>
                ))}
              </div>
              {status?.lastCycleAt && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#374151' }}>
                  Last cycle: {new Date(status.lastCycleAt).toLocaleTimeString()}
                  {status.lastCycleDurationMs != null && ` (${status.lastCycleDurationMs}ms)`}
                </span>
              )}
            </div>

            {visible.length === 0 ? (
              <div style={{ background: '#0d1117', border: '1px solid #1e1e2e', borderRadius: 8, padding: 40, textAlign: 'center', color: '#374151', fontSize: 12 }}>
                {offline
                  ? 'ghostbrain-autonomous service is offline (port 7921)'
                  : proposals.length === 0
                    ? '✓ No proposals in queue — all systems within target parameters'
                    : 'No proposals match the selected filter'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '65vh', overflowY: 'auto' }}>
                {visible.map(p => (
                  <ProposalCard
                    key={p.id}
                    p={p}
                    approving={approving.has(p.id)}
                    onApprove={() => void handleApprove(p)}
                    onReject={() => handleReject(p.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Strategy sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Strategy targets */}
            <div style={{ background: '#111827', border: '1px solid #1e1e2e', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#c4b5fd', marginBottom: 10 }}>Strategy Targets</div>
              {status?.strategy ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, color: '#9ca3af' }}>
                  <div>Validator Load Target: <b style={{ color: '#e2e8f0' }}>{status.strategy.validatorTargetLoad}%</b></div>
                  <div>Treasury Yield Target: <b style={{ color: '#e2e8f0' }}>{status.strategy.treasuryYieldTarget}%</b></div>
                  <div>Node Redundancy:       <b style={{ color: '#e2e8f0' }}>{status.strategy.nodeRedundancy}×</b></div>
                  <div style={{ fontSize: 10, color: '#374151' }}>
                    Generated: {status.strategy.generatedAt ? new Date(status.strategy.generatedAt).toLocaleTimeString() : '—'}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#374151' }}>Waiting for engine…</div>
              )}
            </div>

            {/* AI advice */}
            {status?.strategy?.advice && (
              <div style={{ background: '#111827', border: '1px solid #1e1e2e', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 10 }}>AI Recommendations</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {status.strategy.advice.map((a, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#9ca3af', borderLeft: '2px solid #374151', paddingLeft: 8 }}>
                      {a}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Engine telemetry */}
            {status && (
              <div style={{ background: '#111827', border: '1px solid #1e1e2e', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 10 }}>Engine Telemetry</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: '#4b5563' }}>
                  <div>Proposals sent:    <span style={{ color: '#22c55e' }}>{status.proposalsSent}</span></div>
                  <div>Proposals failed:  <span style={{ color: status.proposalsFailed > 0 ? '#ef4444' : '#6b7280' }}>{status.proposalsFailed}</span></div>
                  <div>Dry-run (staged):  <span style={{ color: '#a855f7' }}>{status.proposalsDryRun}</span></div>
                </div>
              </div>
            )}

            {/* Quick links */}
            <div style={{ background: '#111827', border: '1px solid #1e1e2e', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 10 }}>Subsystems</div>
              {[
                { href: '/supercontrol',         label: 'SuperControl',       color: '#a855f7' },
                { href: '/validators/control',   label: 'Validator Control',  color: '#c4b5fd' },
                { href: '/network',              label: '3D Topology',        color: '#3b82f6' },
                { href: '/bridge/liquidity',     label: 'Liquidity Monitor',  color: '#fbbf24' },
                { href: '/treasury/intelligence',label: 'Treasury Intel',     color: '#22c55e' },
              ].map(l => (
                <a key={l.href} href={l.href}
                  style={{ display: 'block', color: l.color, fontSize: 11, marginBottom: 6, textDecoration: 'none', fontWeight: 600 }}>
                  ↗ {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Governance footer */}
        <div style={{ marginTop: 24, padding: '8px 14px', background: '#0d1117', border: '1px solid #1e1e2e', borderRadius: 6, fontSize: 10, color: '#374151' }}>
          <b style={{ color: '#4b5563' }}>Governance</b> — This console is observe-and-recommend only.
          &quot;Approve&quot; routes a proposal to the signing relay (port 7910) for human ratification via governance quorum.
          The autonomous engine issues no write commands; all execution requires explicit operator approval.
        </div>
      </div>
    </div>
  );
}
