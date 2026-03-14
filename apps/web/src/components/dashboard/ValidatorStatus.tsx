'use client';

/**
 * ValidatorStatus.tsx — Compact dashboard widget showing top validators.
 * Reads from the global ValidatorStore.
 */

import Link from 'next/link';
import { useValidatorStore } from '../../store/validatorStore';

const STATUS_COLOR: Record<string, string> = {
  active:    '#22c55e',
  jailed:    '#ef4444',
  unbonding: '#f59e0b',
  inactive:  '#6b7280',
};

export function ValidatorStatus() {
  const { validators, perf, loading } = useValidatorStore();

  const perfMap = new Map(perf.map(p => [p.address, p]));

  // Show top 5 by power, then sort by status (active first)
  const top = [...validators]
    .sort((a, b) => b.power - a.power)
    .slice(0, 5);

  const activeCount   = validators.filter(v => v.status === 'active').length;
  const jailedCount   = validators.filter(v => v.status === 'jailed').length;
  const avgParticipation = perf.length > 0
    ? perf.reduce((acc, p) => acc + p.uptimePct, 0) / perf.length
    : null;

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Validators</span>
        <Link href="/validators" style={{ fontSize: 11, color: 'var(--accent, #6366f1)' }}>
          All →
        </Link>
      </div>

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>{loading ? '…' : activeCount}</div>
          <div className="muted" style={{ fontSize: 10 }}>Active</div>
        </div>
        {jailedCount > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{jailedCount}</div>
            <div className="muted" style={{ fontSize: 10 }}>Jailed</div>
          </div>
        )}
        {avgParticipation != null && (
          <div style={{ textAlign: 'center', marginLeft: 'auto' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{avgParticipation.toFixed(1)}%</div>
            <div className="muted" style={{ fontSize: 10 }}>Avg uptime</div>
          </div>
        )}
      </div>

      {/* Top validators */}
      {!loading && top.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          {top.map(v => {
            const vPerf = perfMap.get(v.address);
            const color = STATUS_COLOR[v.status] ?? '#6b7280';
            return (
              <div
                key={v.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 8px',
                  borderRadius: 5,
                  background: 'var(--surface-1, #111827)',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.id}
                </span>
                {vPerf && (
                  <span style={{ fontSize: 10, color: vPerf.uptimePct >= 95 ? '#22c55e' : '#f59e0b' }}>
                    {vPerf.uptimePct.toFixed(0)}%
                  </span>
                )}
                <span style={{ fontSize: 10, color }}>
                  {(v.powerPct * 100).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
      {loading && <p className="muted" style={{ fontSize: 12 }}>Loading…</p>}
    </div>
  );
}
