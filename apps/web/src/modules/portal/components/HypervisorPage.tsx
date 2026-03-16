'use client';

import { useEffect, useState } from 'react';

type VM = {
  id: string;
  name: string;
  role: string;
  ip: string;
  state: 'running' | 'stopped' | 'suspended' | 'rebooting' | 'unknown';
  stateLabel: string;
  rpcHealthy: boolean;
  healLevel: string;
  escalated: boolean;
  restarts1h: number;
};

type VMListResponse = {
  vms: VM[];
  total: number;
  running: number;
  dryRun: boolean;
  source: string;
  timestamp: string;
};

const CARD: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px',
};

export function HypervisorPage() {
  const [data, setData] = useState<VMListResponse | null>(null);
  const [actionState, setActionState] = useState<Record<string, 'idle' | 'pending' | 'ok' | 'error'>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/vm', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as VMListResponse;
        if (!cancelled) { setData(json); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'GAIS unreachable');
      }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  async function rebootVm(id: string) {
    setActionState((p) => ({ ...p, [id]: 'pending' }));
    try {
      const res = await fetch('/api/hypervisor/vm/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reboot' }),
      });
      setActionState((p) => ({ ...p, [id]: res.ok ? 'ok' : 'error' }));
    } catch {
      setActionState((p) => ({ ...p, [id]: 'error' }));
    }
    setTimeout(() => setActionState((p) => ({ ...p, [id]: 'idle' })), 3_500);
  }

  const vms = data?.vms ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Hypervisor Management</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Live GhostChain VM inventory from GAIS with operator-safe reboot wiring
          </p>
        </div>
        {data && (
          <div style={{ fontSize: 13, textAlign: 'right' }}>
            <div>
              <span style={{ color: '#22c55e', fontWeight: 700 }}>{data.running}</span>
              <span style={{ color: 'var(--muted)' }}>/{data.total} VMs running</span>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 11 }}>
              {new Date(data.timestamp).toLocaleTimeString()}
            </div>
          </div>
        )}
      </div>

      {data?.dryRun && (
        <div style={{ ...CARD, color: '#f59e0b', fontSize: 13 }}>
          GAIS is in dry-run mode. Reboot requests are accepted for audit, but no live VM mutation is executed.
        </div>
      )}

      {error && (
        <div style={{ ...CARD, color: 'var(--danger)', fontSize: 13 }}>
          Hypervisor API offline — {error}. Ensure GAIS is running on port 9100.
        </div>
      )}

      {!error && vms.length === 0 && (
        <div style={{ ...CARD, color: 'var(--muted)', fontSize: 13 }}>Connecting to hypervisor…</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {vms.map((vm) => {
          const st = actionState[vm.id] ?? 'idle';
          const running = vm.state === 'running';
          const isEscalated = vm.escalated || vm.healLevel === 'escalated';
          const rpcLabel = vm.role === 'l1' || vm.role === 'l2' || vm.role === 'l3'
            ? vm.rpcHealthy ? 'healthy' : 'offline'
            : 'n/a';
          const stateColor =
            isEscalated ? '#ef4444'
              : running ? '#22c55e'
                : vm.state === 'rebooting' ? '#f59e0b'
                  : 'var(--muted)';
          return (
            <div key={vm.id} style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{vm.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {vm.role}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                  background: isEscalated ? 'rgba(239,68,68,0.1)' : running ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.12)',
                  color: stateColor,
                }}>
                  {vm.stateLabel}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 20, fontSize: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>RPC</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600, color: vm.rpcHealthy ? '#22c55e' : 'var(--muted)' }}>
                    {rpcLabel}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Healing</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600, color: isEscalated ? '#ef4444' : 'var(--text)' }}>
                    {vm.healLevel}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Restarts</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {vm.restarts1h}/h
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                  <span style={{ color: 'var(--muted)' }}>
                    IP: <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{vm.ip || 'unresolved'}</span>
                  </span>
                  <span style={{ color: 'var(--muted)' }}>
                    ID: <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{vm.id}</span>
                  </span>
                </div>
                <button
                  disabled={st === 'pending'}
                  onClick={() => { void rebootVm(vm.id); }}
                  style={{
                    fontSize: 11,
                    padding: '6px 12px',
                    borderRadius: 7,
                    cursor: st === 'pending' ? 'not-allowed' : 'pointer',
                    border: '1px solid rgba(245,158,11,0.35)',
                    background: 'rgba(245,158,11,0.08)',
                    color: st === 'pending' ? 'var(--border)' : '#f59e0b',
                    opacity: st === 'pending' ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {st === 'pending' ? 'Sending…' : 'Reboot via GAIS'}
                </button>
              </div>

              {isEscalated && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>
                  Escalated by GAIS circuit breaker or healer policy.
                </div>
              )}
              {st === 'ok' && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>GAIS request accepted ✓</div>}
              {st === 'error' && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6 }}>GAIS request failed</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
