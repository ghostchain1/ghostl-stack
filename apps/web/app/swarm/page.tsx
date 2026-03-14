'use client';

/**
 * GhostBrain Swarm Dashboard (Phases 57-70)
 *
 * Displays the live state of the distributed AI swarm:
 *   - Active swarm agents and heartbeat status
 *   - Alert counts by category (validator / network / security)
 *   - Recent proposals forwarded to the signing relay
 *   - Proposal Approve / Reject buttons (no auto-execute — human in the loop)
 *
 * Data: polls /api/swarm/status (BFF → ghostbrain-coordinator :7923) every 15s.
 */

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertSeverity = 'info' | 'warning' | 'critical';

interface AgentRecord {
  agentId:   string;
  nodeType:  string;
  status:    string;
  uptimeSec: number;
  lastSeen:  string;
}

interface SwarmAlert {
  agentId:   string;
  nodeType:  string;
  topic:     string;
  severity:  AlertSeverity;
  type:      string;
  value?:    number;
  detail:    string;
  ts:        string;
}

interface SwarmProposal {
  id:        string;
  action:    string;
  rationale: string;
  status:    'pending' | 'approved' | 'rejected';
  trigger:   SwarmAlert;
  createdAt: string;
}

interface AlertCounts { validator: number; network: number; security: number; }

interface SwarmStatus {
  natsConnected:   boolean;
  activeAgents:    AgentRecord[];
  alertCounts:     AlertCounts;
  recentAlerts:    SwarmAlert[];
  recentProposals: SwarmProposal[];
  uptimeSec:       number;
  ts:              string;
  error?:          string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<AlertSeverity, string> = {
  critical: '#ef4444',
  warning:  '#f59e0b',
  info:     '#3b82f6',
};

const SEV_BG: Record<AlertSeverity, string> = {
  critical: '#450a0a',
  warning:  '#1c0f00',
  info:     '#0c1a2e',
};

const POLL_MS = 15_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString(); }
  catch { return iso; }
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: '#111827', border: '1px solid #1e1e2e', borderRadius: 8, padding: '10px 16px' }}>
      <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: color ?? '#e2e8f0' }}>{value}</div>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentRecord }) {
  const dot = agent.status === 'healthy' ? '#22c55e' : '#f59e0b';
  return (
    <div style={{ background: '#111827', border: '1px solid #1e1e2e', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block' }} />
        <span style={{ fontFamily: 'monospace', color: '#e2e8f0', fontWeight: 600 }}>{agent.agentId}</span>
      </div>
      <div style={{ color: '#9ca3af' }}>{agent.nodeType} &nbsp;·&nbsp; up {fmtUptime(agent.uptimeSec)}</div>
      <div style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }}>last seen {fmtTime(agent.lastSeen)}</div>
    </div>
  );
}

function AlertRow({ alert }: { alert: SwarmAlert }) {
  const sev = alert.severity ?? 'info';
  return (
    <div style={{ background: SEV_BG[sev], border: `1px solid ${SEV_COLOR[sev]}33`, borderRadius: 6, padding: '8px 12px', marginBottom: 6, fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: SEV_COLOR[sev], fontWeight: 700 }}>{alert.type}</span>
        <span style={{ color: '#6b7280' }}>{fmtTime(alert.ts)}</span>
      </div>
      <div style={{ color: '#d1d5db' }}>{alert.detail}</div>
      <div style={{ color: '#6b7280', marginTop: 2 }}>{alert.agentId} &nbsp;·&nbsp; {alert.nodeType}</div>
    </div>
  );
}

function ProposalCard({
  proposal,
  onApprove,
  onReject,
  actionState,
}: {
  proposal: SwarmProposal;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  actionState: 'idle' | 'approving' | 'rejecting' | 'approved' | 'rejected';
}) {
  const sev = proposal.trigger?.severity ?? 'info';
  return (
    <div style={{
      background: SEV_BG[sev],
      border: `1px solid ${SEV_COLOR[sev]}44`,
      borderRadius: 8, padding: '12px 16px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{proposal.id.slice(0, 8)}</span>
        <span style={{ fontSize: 10, color: '#4b5563' }}>{fmtTime(proposal.createdAt)}</span>
      </div>
      <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>{proposal.action}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>{proposal.rationale}</div>

      {actionState === 'approved' && (
        <div style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>✓ Forwarded to signing relay</div>
      )}
      {actionState === 'rejected' && (
        <div style={{ color: '#ef4444', fontSize: 12 }}>✗ Rejected</div>
      )}
      {(actionState === 'idle' || actionState === 'approving' || actionState === 'rejecting') && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onApprove(proposal.id)}
            disabled={actionState !== 'idle'}
            style={{
              padding: '5px 14px', fontSize: 12, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: '#16a34a', color: '#fff', fontWeight: 600,
              opacity: actionState !== 'idle' ? 0.5 : 1,
            }}
          >
            {actionState === 'approving' ? 'Forwarding…' : 'Approve'}
          </button>
          <button
            onClick={() => onReject(proposal.id)}
            disabled={actionState !== 'idle'}
            style={{
              padding: '5px 14px', fontSize: 12, borderRadius: 4, border: '1px solid #374151', cursor: 'pointer',
              background: 'transparent', color: '#9ca3af',
              opacity: actionState !== 'idle' ? 0.5 : 1,
            }}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SwarmPage() {
  const [status, setStatus] = useState<SwarmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [proposalActions, setProposalActions] = useState<Record<string, 'idle' | 'approving' | 'rejecting' | 'approved' | 'rejected'>>({});
  const [activeTab, setActiveTab] = useState<'agents' | 'alerts' | 'proposals'>('agents');

  const fetchStatus = async () => {
    try {
      const r = await fetch('/api/swarm/status', { cache: 'no-store' });
      const data = await r.json() as SwarmStatus;
      setStatus(data);
    } catch { /* keep last state */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void fetchStatus();
    const t = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(t);
  }, []);

  const handleApprove = async (id: string) => {
    setProposalActions((p) => ({ ...p, [id]: 'approving' }));
    try {
      await fetch('/api/hyperghost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: id, action: 'approve' }),
      });
      setProposalActions((p) => ({ ...p, [id]: 'approved' }));
    } catch {
      setProposalActions((p) => ({ ...p, [id]: 'idle' }));
    }
  };

  const handleReject = (id: string) => {
    setProposalActions((p) => ({ ...p, [id]: 'rejected' }));
  };

  const s = status;
  const counts = s?.alertCounts ?? { validator: 0, network: 0, security: 0 };
  const totalAlerts = counts.validator + counts.network + counts.security;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', color: '#e2e8f0', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f8fafc' }}>
          ⬡ GhostBrain Swarm
        </h1>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          Distributed AI agent network — detect-only · proposals require human approval
          {s?.ts && <span style={{ marginLeft: 12 }}>last update {fmtTime(s.ts)}</span>}
        </div>
      </div>

      {/* Status banner */}
      {s?.error && (
        <div style={{ background: '#1c0f00', border: '1px solid #78350f', borderRadius: 6, padding: '8px 14px', marginBottom: 16, fontSize: 12, color: '#fbbf24' }}>
          ⚠ Coordinator offline — showing last known state
        </div>
      )}

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 24 }}>
        <StatBox label="Active Agents"      value={loading ? '…' : s?.activeAgents.length ?? 0}  color="#22c55e" />
        <StatBox label="NATS Connected"     value={s?.natsConnected ? 'Yes' : 'No'}               color={s?.natsConnected ? '#22c55e' : '#ef4444'} />
        <StatBox label="Validator Alerts"   value={counts.validator}   color={counts.validator   > 0 ? '#f59e0b' : '#6b7280'} />
        <StatBox label="Network Alerts"     value={counts.network}     color={counts.network     > 0 ? '#f59e0b' : '#6b7280'} />
        <StatBox label="Security Alerts"    value={counts.security}    color={counts.security    > 0 ? '#ef4444' : '#6b7280'} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #1e293b' }}>
        {(['agents', 'alerts', 'proposals'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '7px 16px', fontSize: 13, border: 'none', borderRadius: '4px 4px 0 0', cursor: 'pointer',
              background: activeTab === tab ? '#1e293b' : 'transparent',
              color: activeTab === tab ? '#f1f5f9' : '#6b7280',
              fontWeight: activeTab === tab ? 600 : 400,
            }}
          >
            {tab === 'agents'    && `Agents (${s?.activeAgents.length ?? 0})`}
            {tab === 'alerts'    && `Alerts (${totalAlerts})`}
            {tab === 'proposals' && `Proposals (${s?.recentProposals.length ?? 0})`}
          </button>
        ))}
      </div>

      {/* Agents tab */}
      {activeTab === 'agents' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {(s?.activeAgents ?? []).length === 0 ? (
            <div style={{ color: '#4b5563', gridColumn: '1/-1' }}>No agents have connected yet.</div>
          ) : (
            (s?.activeAgents ?? []).map((a) => <AgentCard key={a.agentId} agent={a} />)
          )}
        </div>
      )}

      {/* Alerts tab */}
      {activeTab === 'alerts' && (
        <div>
          {(s?.recentAlerts ?? []).length === 0 ? (
            <div style={{ color: '#4b5563' }}>No recent alerts.</div>
          ) : (
            (s?.recentAlerts ?? []).map((alert, i) => (
              <AlertRow key={`${alert.agentId}-${alert.ts}-${i}`} alert={alert} />
            ))
          )}
        </div>
      )}

      {/* Proposals tab */}
      {activeTab === 'proposals' && (
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
            Proposals require human approval — no autonomous execution.
          </div>
          {(s?.recentProposals ?? []).length === 0 ? (
            <div style={{ color: '#4b5563' }}>No proposals generated yet.</div>
          ) : (
            (s?.recentProposals ?? []).map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                onApprove={handleApprove}
                onReject={handleReject}
                actionState={proposalActions[p.id] ?? 'idle'}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
