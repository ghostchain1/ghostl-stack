'use client';

import { useEffect, useState } from 'react';

type ServiceHealth = { name: string; port: number; status: 'up' | 'down' | 'degraded'; latency?: number; version?: string; details?: string };
type AIStatus = { services: ServiceHealth[]; agentCount?: number; tasksQueued?: number; tasksCompleted?: number; swarmHealth?: string };

type DomainSwarm = {
  ok: boolean; dryRun: boolean; uptime: number;
  agents: { names: string[]; count: number };
  proposals: { total: number; failed: number };
  events: { buffered: number };
  intelligence: { anomaly: { runs: number; errors: number }; prediction: { runs: number } };
};
type BrainSwarm = { agents?: number; tasks?: { queued: number; completed: number } };
type SwarmData = { domain: DomainSwarm | null; brain: BrainSwarm | null; ok: boolean };

const AI_PORTS: Array<{ name: string; port: number }> = [
  { name: 'GhostBrain Core', port: 7900 },
  { name: 'Signing Relay', port: 7910 },
  { name: 'AI Consensus', port: 7920 },
  { name: 'Ghost Oracle', port: 7930 },
  { name: 'Infra Controller', port: 7940 },
  { name: 'NOC AI', port: 7960 },
];

const CARD: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px',
};

function statusColor(s: 'up' | 'down' | 'degraded') {
  return s === 'up' ? '#22c55e' : s === 'degraded' ? '#f59e0b' : '#ef4444';
}

export function AIPage() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [swarm, setSwarm] = useState<SwarmData | null>(null);
  const [actionState, setActionState] = useState<'idle' | 'pending' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/ai', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as AIStatus;
        if (!cancelled) { setStatus(json); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'GhostBrain unreachable');
      }
    }
    async function pollSwarm() {
      try {
        const res = await fetch('/api/ai/swarm', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json() as SwarmData;
        if (!cancelled) setSwarm(json);
      } catch { /* swarm is optional */ }
    }
    void poll();
    void pollSwarm();
    const id1 = setInterval(() => { void poll(); }, 20_000);
    const id2 = setInterval(() => { void pollSwarm(); }, 15_000);
    return () => { cancelled = true; clearInterval(id1); clearInterval(id2); };
  }, []);

  async function reloadBrain() {
    setActionState('pending');
    try {
      const res = await fetch('/api/ai/reload', { method: 'POST' });
      setActionState(res.ok ? 'ok' : 'error');
    } catch {
      setActionState('error');
    }
    setTimeout(() => setActionState('idle'), 4_000);
  }

  const services: ServiceHealth[] = status?.services ?? AI_PORTS.map((s) => ({ ...s, status: 'down' as const, latency: undefined, version: undefined, details: undefined }));
  const upCount = services.filter((s) => s.status === 'up').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>AI Systems</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            GhostBrain services, swarm agents, oracles and inference layers
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            <span style={{ color: upCount === services.length ? '#22c55e' : '#f59e0b', fontWeight: 700 }}>{upCount}</span>
            /{services.length} services up
          </span>
          <button
            onClick={() => { void reloadBrain(); }}
            disabled={actionState === 'pending'}
            style={{
              fontSize: 12, padding: '6px 14px', borderRadius: 8, cursor: actionState === 'pending' ? 'not-allowed' : 'pointer',
              border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)',
            }}
          >
            {actionState === 'pending' ? 'Reloading…' : actionState === 'ok' ? 'Reloaded ✓' : actionState === 'error' ? 'Failed ✗' : 'Reload GhostBrain'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ ...CARD, color: 'var(--danger)', fontSize: 13 }}>
          GhostBrain Core offline — {error}. Port 7900 not reachable.
        </div>
      )}

      {/* Aggregate stats */}
      {status && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {[
            { label: 'Active Agents', value: status.agentCount ?? '—' },
            { label: 'Tasks Queued', value: status.tasksQueued ?? '—' },
            { label: 'Tasks Completed', value: status.tasksCompleted ?? '—' },
            { label: 'Swarm Health', value: status.swarmHealth ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ ...CARD, padding: '14px 18px' }}>
              <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
              <div style={{ fontWeight: 700, fontSize: 20, fontFamily: 'monospace' }}>{String(value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Service health cards */}
      <div>
        <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600 }}>Service Health</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {services.map((svc) => (
            <div key={svc.port} style={{ ...CARD, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{svc.name}</div>
                <div style={{
                  width: 9, height: 9, borderRadius: '50%', background: statusColor(svc.status),
                  boxShadow: svc.status === 'up' ? '0 0 6px rgba(34,197,94,0.4)' : 'none',
                }} />
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 12, display: 'flex', gap: 12 }}>
                <span>:{svc.port}</span>
                {svc.latency !== undefined && <span style={{ fontFamily: 'monospace' }}>{svc.latency}ms</span>}
                {svc.version && <span>{svc.version}</span>}
              </div>
              {svc.details && (
                <div style={{ fontSize: 11, color: svc.status === 'down' ? 'var(--danger)' : 'var(--muted)', marginTop: 6 }}>
                  {svc.details}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* AI Swarm Status panel */}
      {swarm && (
        <div>
          <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600 }}>AI Swarm</h2>
          <div style={{ ...CARD }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 16 }}>
              {[
                { label: 'Domain Agents', value: swarm.domain?.agents?.count ?? '—', ok: swarm.domain?.ok },
                { label: 'Proposals Total', value: swarm.domain?.proposals?.total ?? 0 },
                { label: 'Proposal Errors', value: swarm.domain?.proposals?.failed ?? 0, warn: (swarm.domain?.proposals?.failed ?? 0) > 0 },
                { label: 'Events Buffered', value: swarm.domain?.events?.buffered ?? 0 },
                { label: 'Anomaly Runs', value: swarm.domain?.intelligence?.anomaly?.runs ?? '—' },
                { label: 'Prediction Runs', value: swarm.domain?.intelligence?.prediction?.runs ?? '—' },
              ].map(({ label, value, ok, warn }) => (
                <div key={label}>
                  <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                  <div style={{
                    fontWeight: 700, fontSize: 20, fontFamily: 'monospace',
                    color: ok === false ? 'var(--danger)' : warn ? '#f59e0b' : 'inherit',
                  }}>{String(value)}</div>
                </div>
              ))}
            </div>

            {/* Domain agent list */}
            {swarm.domain?.agents?.names && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {swarm.domain.agents.names.map((n) => (
                  <span key={n} style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 20,
                    background: 'var(--accent)', color: '#fff', fontWeight: 600, textTransform: 'capitalize',
                  }}>{n}</span>
                ))}
              </div>
            )}

            {swarm.domain?.dryRun && (
              <div style={{ marginTop: 10, fontSize: 11, color: '#f59e0b' }}>
                DRY RUN mode — proposals are logged but not forwarded to signing relay
              </div>
            )}
          </div>
        </div>
      )}

      {/* Governance note */}
      <div style={{
        ...CARD, padding: '14px 18px',
        borderLeft: '3px solid var(--accent)',
        fontSize: 12, color: 'var(--muted)',
      }}>
        <strong style={{ color: 'var(--text)' }}>AI Autonomy Notice:</strong> GhostBrain may draft governance proposals but cannot ratify or execute them without human quorum. All proposals are routed through the signing relay for review.
      </div>
    </div>
  );
}
