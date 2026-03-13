'use client';

import { useEffect, useState } from 'react';

type ValidatorEntry = { address: string; moniker: string; power: string; uptime: number; status: 'active' | 'jailed' | 'inactive' };
type ValidatorsResponse = { validators: ValidatorEntry[]; totalPower: string; activeCount: number };

const CARD: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px',
};

export function ValidatorsPage() {
  const [data, setData] = useState<ValidatorsResponse | null>(null);
  const [actionState, setActionState] = useState<Record<string, 'idle' | 'pending' | 'ok' | 'error'>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/command-center/validators', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as ValidatorsResponse;
        if (!cancelled) { setData(json); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unreachable');
      }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  async function sendProposal(addr: string, action: string) {
    setActionState((p) => ({ ...p, [addr]: 'pending' }));
    try {
      const res = await fetch('/api/portal/nodes/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addr, action, type: 'validator' }),
      });
      setActionState((p) => ({ ...p, [addr]: res.ok ? 'ok' : 'error' }));
    } catch {
      setActionState((p) => ({ ...p, [addr]: 'error' }));
    }
    setTimeout(() => setActionState((p) => ({ ...p, [addr]: 'idle' })), 3_500);
  }

  const validators = data?.validators ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Validator Control</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            GhostChain L1 validators — stake, uptime, slashing risk
          </p>
        </div>
        {data && (
          <div style={{ textAlign: 'right', fontSize: 13 }}>
            <div><span style={{ color: '#22c55e', fontWeight: 700 }}>{data.activeCount}</span> active</div>
            <div style={{ color: 'var(--muted)', fontSize: 11 }}>tot. power: {data.totalPower}</div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ ...CARD, color: 'var(--danger)', fontSize: 13 }}>
          Validator API offline — {error}
        </div>
      )}

      <div style={CARD}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '200px 1fr 100px 80px 80px 110px',
          gap: 12, padding: '8px 12px', fontSize: 11, fontWeight: 600,
          color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em',
          borderBottom: '1px solid var(--border)', marginBottom: 4,
        }}>
          <span>Moniker</span><span>Address</span><span>Power (GST)</span><span>Uptime</span><span>Status</span><span>Action</span>
        </div>

        {validators.length === 0 && !error && (
          <div style={{ padding: '20px 12px', color: 'var(--muted)', fontSize: 13 }}>Loading validators…</div>
        )}

        {validators.map((v) => {
          const st = actionState[v.address] ?? 'idle';
          const isJailed = v.status === 'jailed';
          return (
            <div key={v.address} style={{
              display: 'grid', gridTemplateColumns: '200px 1fr 100px 80px 80px 110px',
              gap: 12, alignItems: 'center', padding: '10px 12px', fontSize: 12,
              borderBottom: '1px solid var(--border)',
              background: isJailed ? 'rgba(239,68,68,0.03)' : 'transparent',
            }}>
              <span style={{ fontWeight: 600 }}>{v.moniker || 'unnamed'}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                {v.address.slice(0, 12)}…{v.address.slice(-6)}
              </span>
              <span style={{ fontFamily: 'monospace' }}>{Number(v.power).toLocaleString()}</span>
              <span style={{ color: v.uptime >= 95 ? '#22c55e' : v.uptime >= 80 ? '#f59e0b' : '#ef4444' }}>
                {v.uptime}%
              </span>
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600, textAlign: 'center',
                background: v.status === 'active' ? 'rgba(34,197,94,0.1)' : v.status === 'jailed' ? 'rgba(239,68,68,0.1)' : 'rgba(107,114,128,0.1)',
                color: v.status === 'active' ? '#22c55e' : v.status === 'jailed' ? '#ef4444' : '#6b7280',
              }}>
                {v.status}
              </span>
              <button
                onClick={() => { void sendProposal(v.address, 'restart_validator'); }}
                disabled={st === 'pending'}
                style={{
                  fontSize: 11, padding: '5px 10px', borderRadius: 8,
                  cursor: st === 'pending' ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--border)',
                  background: st === 'ok' ? 'rgba(34,197,94,0.1)' : st === 'error' ? 'rgba(239,68,68,0.1)' : 'transparent',
                  color: st === 'ok' ? '#22c55e' : st === 'error' ? '#ef4444' : 'var(--muted)',
                }}
              >
                {st === 'pending' ? '…' : st === 'ok' ? 'Proposed ✓' : st === 'error' ? 'Failed' : 'Propose Restart'}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ ...CARD, fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 8 }}>
        <span style={{ color: 'var(--warning)' }}>ⓘ</span>
        Validator control actions are forwarded to the signing relay as governance proposals. Human ratification required.
      </div>
    </div>
  );
}
