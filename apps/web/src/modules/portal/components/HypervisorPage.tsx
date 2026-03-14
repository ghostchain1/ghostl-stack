'use client';

import { useEffect, useState } from 'react';

type VM = { id: string; name: string; state: string; cpuPercent?: number; memoryMb?: number; memoryMaxMb?: number };
type VMListResponse = { vms: VM[]; total: number; running: number };

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

  async function vmAction(id: string, action: string) {
    setActionState((p) => ({ ...p, [id]: 'pending' }));
    try {
      const res = await fetch('/api/hypervisor/vm/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
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
            Virtual machine control via GAIS kernel — start, stop, reboot, suspend
          </p>
        </div>
        {data && (
          <div style={{ fontSize: 13 }}>
            <span style={{ color: '#22c55e', fontWeight: 700 }}>{data.running}</span>
            <span style={{ color: 'var(--muted)' }}>/{data.total} VMs running</span>
          </div>
        )}
      </div>

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
          const cpuPct = vm.cpuPercent ?? 0;
          const memPct = vm.memoryMb && vm.memoryMaxMb ? Math.round((vm.memoryMb / vm.memoryMaxMb) * 100) : null;
          return (
            <div key={vm.id} style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{vm.name}</div>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                  background: running ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: running ? '#22c55e' : '#ef4444',
                }}>
                  {vm.state}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 20, fontSize: 12, marginBottom: 14 }}>
                {cpuPct !== null && (
                  <div>
                    <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>CPU</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600, color: cpuPct > 80 ? 'var(--danger)' : 'var(--text)' }}>
                      {cpuPct}%
                    </div>
                  </div>
                )}
                {memPct !== null && (
                  <div>
                    <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>RAM</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600, color: memPct > 85 ? 'var(--danger)' : 'var(--text)' }}>
                      {vm.memoryMb} MB
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>ID</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{vm.id.slice(0, 10)}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {(['start', 'stop', 'reboot', 'suspend'] as const).map((action) => {
                  const disabled = st === 'pending' ||
                    (action === 'start' && running) ||
                    (action === 'stop' && !running) ||
                    (action === 'suspend' && !running);
                  return (
                    <button
                      key={action}
                      disabled={disabled}
                      onClick={() => { void vmAction(vm.id, action); }}
                      style={{
                        fontSize: 11, padding: '5px 11px', borderRadius: 7, cursor: disabled ? 'not-allowed' : 'pointer',
                        border: '1px solid var(--border)', background: 'transparent',
                        color: disabled ? 'var(--border)' : action === 'stop' ? 'var(--danger)' : 'var(--muted)',
                        opacity: disabled ? 0.4 : 1,
                      }}
                    >
                      {st === 'pending' ? '…' : action.charAt(0).toUpperCase() + action.slice(1)}
                    </button>
                  );
                })}
              </div>

              {st === 'ok' && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>Action sent ✓</div>}
              {st === 'error' && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6 }}>Action failed</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
