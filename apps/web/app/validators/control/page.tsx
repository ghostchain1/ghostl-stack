'use client';

/**
 * Validator Control — Autonomous Validator Orchestration Dashboard
 *
 * Displays live validator state and allows operators to trigger write
 * actions (restart, stop) through the existing kernel command bus at
 * /api/hypervisor/container/action.
 *
 * All write actions are human-initiated through this UI; the kernel's
 * safety_guard validates target format, allowlist, protected patterns,
 * and rate limits before anything is dispatched.
 */

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Validator {
  name:         string;
  address?:     string;
  status?:      string;
  uptime?:      number;
  cpu?:         number;
  memory?:      number;
  jailed?:      boolean;
  missedBlocks?: number;
  votingPower?: string;
  commission?:  string;
}

interface ValidatorResponse {
  validators?: Validator[];
  total?:      number;
}

// ── Action colours ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  active:   '#22c55e',
  inactive: '#6b7280',
  jailed:   '#ef4444',
  unknown:  '#f59e0b',
};

function uptimeColor(u?: number): string {
  if (u == null) return '#6b7280';
  if (u >= 0.99) return '#22c55e';
  if (u >= 0.90) return '#84cc16';
  if (u >= 0.80) return '#f59e0b';
  return '#ef4444';
}

// ── Confirm-gated action button ────────────────────────────────────────────────

function ActionButton({
  label, action, target, danger,
  onResult,
}: {
  label:    string;
  action:   string;
  target:   string;
  danger?:  boolean;
  onResult: (msg: string, ok: boolean) => void;
}) {
  const [busy,    setBusy]    = useState(false);
  const [confirm, setConfirm] = useState(false);

  const execute = async () => {
    setBusy(true);
    setConfirm(false);
    try {
      const res = await fetch('/api/hypervisor/container/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: target, action }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (res.ok && data.ok !== false) {
        onResult(`${action} dispatched for ${target}`, true);
      } else {
        onResult(data.error ?? data.message ?? `Action failed (HTTP ${res.status})`, false);
      }
    } catch (e) {
      onResult(e instanceof Error ? e.message : 'Network error', false);
    } finally {
      setBusy(false);
    }
  };

  if (confirm) {
    return (
      <span style={{ display:'inline-flex', gap:4 }}>
        <button
          onClick={() => void execute()}
          disabled={busy}
          style={{ background:'#7f1d1d', border:'1px solid #ef4444', color:'#fca5a5', padding:'3px 8px', borderRadius:4, cursor:'pointer', fontSize:11 }}
        >
          {busy ? '…' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirm(false)}
          style={{ background:'#111827', border:'1px solid #374151', color:'#6b7280', padding:'3px 6px', borderRadius:4, cursor:'pointer', fontSize:11 }}
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      disabled={busy}
      style={{
        background: danger ? '#1f0f0f' : '#111827',
        border:     `1px solid ${danger ? '#dc2626' : '#374151'}`,
        color:      danger ? '#f87171' : '#9ca3af',
        padding:    '3px 10px',
        borderRadius: 4,
        cursor:     'pointer',
        fontSize:   11,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ValidatorControl() {
  const [validators, setValidators] = useState<Validator[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);
  const [filter,     setFilter]     = useState<'all' | 'jailed' | 'lowUptime'>('all');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/validators');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ValidatorResponse | Validator[];
      const list = Array.isArray(data) ? data : (data.validators ?? []);
      setValidators(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load validators');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const intv = setInterval(() => void load(), 15_000);
    return () => clearInterval(intv);
  }, [load]);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4_000);
  };

  const filtered = validators.filter(v => {
    if (filter === 'jailed')    return v.jailed;
    if (filter === 'lowUptime') return (v.uptime ?? 1) < 0.9;
    return true;
  });

  const jailedCount   = validators.filter(v => v.jailed).length;
  const lowUptimeCount= validators.filter(v => (v.uptime ?? 1) < 0.9).length;
  const avgCpu        = validators.length
    ? Math.round(validators.reduce((s, v) => s + (v.cpu ?? 0), 0) / validators.length)
    : 0;

  return (
    <div style={{ minHeight:'100vh', background:'#0a0a0f', color:'#e2e8f0', fontFamily:'monospace' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', top:16, right:16, zIndex:9999,
          background: toast.ok ? '#052e16' : '#450a0a',
          border:`1px solid ${toast.ok ? '#16a34a' : '#ef4444'}`,
          color: toast.ok ? '#86efac' : '#fca5a5',
          borderRadius:8, padding:'10px 16px', fontSize:13, boxShadow:'0 4px 20px #0008',
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'24px 20px' }}>
        {/* Header */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:20, fontWeight:700, color:'#a855f7', marginBottom:4 }}>
            Validator Control
          </div>
          <div style={{ fontSize:12, color:'#6b7280' }}>
            Human-initiated orchestration · All actions kernel-validated via safety_guard
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
          {[
            { label:'Total Validators', value: validators.length, color:'#c4b5fd' },
            { label:'Jailed',           value: jailedCount,       color: jailedCount > 0 ? '#ef4444' : '#22c55e' },
            { label:'Low Uptime (<90%)',value: lowUptimeCount,    color: lowUptimeCount > 0 ? '#f59e0b' : '#22c55e' },
            { label:'Avg CPU',          value: `${avgCpu}%`,      color: avgCpu > 80 ? '#ef4444' : '#22c55e' },
          ].map(s => (
            <div key={s.label} style={{ background:'#111827', border:'1px solid #1e1e2e', borderRadius:8, padding:'12px 16px' }}>
              <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase' }}>{s.label}</div>
              <div style={{ fontSize:22, fontWeight:700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filter chips */}
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {(['all','jailed','lowUptime'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? '#1e1035' : '#111827',
                border:     `1px solid ${filter === f ? '#7c3aed' : '#374151'}`,
                color:      filter === f ? '#c4b5fd' : '#6b7280',
                padding:    '4px 12px',
                borderRadius: 20,
                cursor:     'pointer',
                fontSize:   11,
                fontWeight: 600,
              }}
            >
              {f === 'all' ? 'All' : f === 'jailed' ? `Jailed (${jailedCount})` : `Low Uptime (${lowUptimeCount})`}
            </button>
          ))}
          <button
            onClick={() => void load()}
            style={{ marginLeft:'auto', background:'none', border:'1px solid #374151', color:'#6b7280', padding:'4px 10px', borderRadius:4, cursor:'pointer', fontSize:11 }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background:'#450a0a', border:'1px solid #dc2626', borderRadius:6, padding:'8px 12px', color:'#fca5a5', fontSize:12, marginBottom:16 }}>
            {error}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{ textAlign:'center', color:'#6b7280', padding:40, fontSize:13 }}>Loading validators…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', color:'#6b7280', padding:40, fontSize:13 }}>No validators match this filter.</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filtered.map(v => {
              const name     = v.name ?? v.address ?? 'unknown';
              const status   = v.jailed ? 'jailed' : (v.status ?? 'unknown');
              const statusCol= STATUS_COLOR[status] ?? '#6b7280';
              const upCol    = uptimeColor(v.uptime);

              return (
                <div
                  key={name}
                  style={{
                    background:   '#111827',
                    border:       `1px solid ${v.jailed ? '#7f1d1d' : '#1e1e2e'}`,
                    borderRadius: 8,
                    padding:      '14px 16px',
                    display:      'grid',
                    gridTemplateColumns:'1fr auto',
                    gap:          12,
                    alignItems:   'center',
                  }}
                >
                  {/* Left: info */}
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:statusCol }} />
                      <span style={{ fontWeight:700, color:'#e2e8f0', fontSize:13 }}>{name}</span>
                      {v.jailed && (
                        <span style={{ background:'#7f1d1d', color:'#fca5a5', fontSize:9, padding:'1px 6px', borderRadius:4, fontWeight:700 }}>
                          JAILED
                        </span>
                      )}
                    </div>
                    <div style={{ display:'flex', gap:16, fontSize:11, color:'#9ca3af' }}>
                      <span>Status: <span style={{ color:statusCol }}>{status}</span></span>
                      {v.uptime != null && (
                        <span>Uptime: <span style={{ color:upCol }}>{(v.uptime * 100).toFixed(1)}%</span></span>
                      )}
                      {v.cpu != null && (
                        <span>CPU: <span style={{ color: v.cpu > 80 ? '#ef4444' : '#9ca3af' }}>{v.cpu}%</span></span>
                      )}
                      {v.memory != null && (
                        <span>Mem: {v.memory}%</span>
                      )}
                      {v.missedBlocks != null && (
                        <span>Missed: <span style={{ color: v.missedBlocks > 10 ? '#ef4444' : '#9ca3af' }}>{v.missedBlocks}</span></span>
                      )}
                    </div>
                  </div>

                  {/* Right: actions — human-initiated, kernel-gated */}
                  <div style={{ display:'flex', gap:6 }}>
                    <ActionButton
                      label="Restart"
                      action="restart"
                      target={name}
                      danger
                      onResult={showToast}
                    />
                    <ActionButton
                      label="Stop"
                      action="stop"
                      target={name}
                      danger
                      onResult={showToast}
                    />
                    <ActionButton
                      label="Start"
                      action="start"
                      target={name}
                      onResult={showToast}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop:16, fontSize:10, color:'#374151', textAlign:'right' }}>
          Actions gated by safety_guard · KERNEL_TARGET_ALLOWLIST enforced · Rate limited
        </div>
      </div>
    </div>
  );
}
