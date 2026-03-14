'use client';

/**
 * ChainStatus.tsx — Compact dashboard widget showing live L1/L2/L3 health.
 * Reads from the global ChainStore (no local fetch).
 */

import Link from 'next/link';
import { useChainStore } from '../../store/chainStore';

const LAYER_PATHS: Record<string, string> = {
  l1: '/chains/l1',
  l2: '/chains/l2',
  l3: '/chains/l3',
};

export function ChainStatus() {
  const { status, loading } = useChainStore();

  const layers = [
    { key: 'l1', label: 'GhostChain L1', chainId: '14000101' },
    { key: 'l2', label: 'GhostL2',       chainId: '901'      },
    { key: 'l3', label: 'GhostL3',       chainId: '903'      },
  ] as const;

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Chain Status</span>
        <Link href="/network-map" style={{ fontSize: 11, color: 'var(--accent, #6366f1)' }}>
          Map →
        </Link>
      </div>

      {loading && !status ? (
        <p className="muted" style={{ fontSize: 12 }}>Loading…</p>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {layers.map(({ key, label, chainId }) => {
            const s = status?.[key];
            const ok = s?.ok;
            const color = ok == null ? '#6b7280' : ok ? '#22c55e' : '#ef4444';
            return (
              <Link
                key={key}
                href={LAYER_PATHS[key]}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'var(--surface-1, #111827)',
                    border: `1px solid ${color}40`,
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: color,
                      flexShrink: 0,
                      boxShadow: `0 0 6px ${color}`,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
                    <div className="muted" style={{ fontSize: 10 }}>Chain ID {chainId}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {s?.blockNumber != null && (
                      <div style={{ fontSize: 11, fontWeight: 600 }}>
                        #{s.blockNumber.toLocaleString()}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: ok ? '#22c55e' : ok === false ? '#ef4444' : '#6b7280' }}>
                      {ok == null ? '…' : ok ? 'Online' : 'Degraded'}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
