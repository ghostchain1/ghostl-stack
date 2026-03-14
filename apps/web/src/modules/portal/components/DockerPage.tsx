'use client';

import { useEffect, useState } from 'react';

type Container = { Id?: string; Names?: string[]; Image?: string; State?: string; Status?: string; state?: string; name?: string; image?: string };
type ContainersResponse = { containers: Container[]; total: number; running: number; stopped: number };

const CARD: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px',
};

function containerName(c: Container): string {
  if (c.name) return c.name;
  const n = c.Names?.[0] ?? c.Id ?? 'unknown';
  return n.startsWith('/') ? n.slice(1) : n;
}

function containerState(c: Container): string {
  return (c.State ?? c.state ?? 'unknown').toLowerCase();
}

export function DockerPage() {
  const [data, setData] = useState<ContainersResponse | null>(null);
  const [actionState, setActionState] = useState<Record<string, 'idle' | 'pending' | 'ok' | 'error'>>({});
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all');

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/docker/containers', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as ContainersResponse;
        if (!cancelled) setData(json);
      } catch { /* swallow */ }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  async function containerAction(name: string, action: string) {
    setActionState((p) => ({ ...p, [name]: 'pending' }));
    try {
      const res = await fetch('/api/hypervisor/container/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, action }),
      });
      setActionState((p) => ({ ...p, [name]: res.ok ? 'ok' : 'error' }));
    } catch {
      setActionState((p) => ({ ...p, [name]: 'error' }));
    }
    setTimeout(() => setActionState((p) => ({ ...p, [name]: 'idle' })), 3_000);
  }

  const allContainers = data?.containers ?? [];
  const filtered = allContainers.filter((c) => {
    const s = containerState(c);
    if (filter === 'running') return s === 'running';
    if (filter === 'stopped') return s !== 'running';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Docker Management</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Container control via GhostBrain kernel — restart, stop, pause
          </p>
        </div>
        {data && (
          <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
            <span><span style={{ color: '#22c55e', fontWeight: 700 }}>{data.running}</span> running</span>
            <span><span style={{ color: '#ef4444', fontWeight: 700 }}>{data.stopped}</span> stopped</span>
            <span style={{ color: 'var(--muted)' }}>{data.total} total</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['all', 'running', 'stopped'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontSize: 12, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: filter === f ? 'rgba(35,214,166,0.1)' : 'transparent',
              color: filter === f ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div style={CARD}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 220px 90px 130px',
          gap: 12, padding: '8px 12px 10px', fontSize: 11, fontWeight: 600,
          color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em',
          borderBottom: '1px solid var(--border)',
        }}>
          <span>Container</span><span>Image</span><span>State</span><span>Actions</span>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: '20px 12px', color: 'var(--muted)', fontSize: 13 }}>
            {data ? 'No containers match the filter.' : 'Connecting to Docker API…'}
          </div>
        )}

        {filtered.map((c) => {
          const name = containerName(c);
          const state = containerState(c);
          const img = c.Image ?? c.image ?? '—';
          const st = actionState[name] ?? 'idle';
          const running = state === 'running';
          return (
            <div key={c.Id ?? name} style={{
              display: 'grid', gridTemplateColumns: '1fr 220px 90px 130px',
              gap: 12, alignItems: 'center', padding: '9px 12px', fontSize: 12,
              borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{name}</span>
              <span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {img.split('/').pop()}
              </span>
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600, textAlign: 'center',
                background: running ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: running ? '#22c55e' : '#ef4444',
              }}>
                {state}
              </span>
              <div style={{ display: 'flex', gap: 5 }}>
                <button
                  disabled={st === 'pending'}
                  onClick={() => { void containerAction(name, 'restart'); }}
                  style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: st === 'ok' ? 'rgba(34,197,94,0.1)' : 'transparent',
                    color: st === 'ok' ? '#22c55e' : 'var(--muted)',
                  }}
                >
                  {st === 'pending' ? '…' : st === 'ok' ? '✓' : 'Restart'}
                </button>
                <button
                  disabled={st === 'pending' || !running}
                  onClick={() => { void containerAction(name, 'stop'); }}
                  style={{
                    fontSize: 11, padding: '4px 9px', borderRadius: 7, cursor: running ? 'pointer' : 'not-allowed',
                    border: '1px solid var(--border)', background: 'transparent',
                    color: running ? 'var(--danger)' : 'var(--border)',
                    opacity: running ? 1 : 0.4,
                  }}
                >
                  Stop
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
