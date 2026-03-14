'use client';

/**
 * GlobalStatusBar.tsx — Compact top-of-page status bar showing L1/L2/L3
 * health, AI alert level, and SSE connection indicator.
 *
 * Reads from the global ChainStore and AIStore — no local fetch.
 */

import Link from 'next/link';
import { useChainStore } from '../../../store/chainStore';
import { useAIStore } from '../../../store/aiStore';

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function AlertBadge({ level }: { level: 'green' | 'yellow' | 'red' }) {
  const map = {
    green:  { color: '#22c55e', label: 'AI: OK' },
    yellow: { color: '#f59e0b', label: 'AI: WARN' },
    red:    { color: '#ef4444', label: 'AI: ALERT' },
  };
  const { color, label } = map[level];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '1px 7px',
        borderRadius: 8,
        background: `${color}25`,
        color,
        border: `1px solid ${color}50`,
      }}
    >
      {label}
    </span>
  );
}

export function GlobalStatusBar() {
  const { status, loading: chainLoading } = useChainStore();
  const { alertLevel, pendingRecs }       = useAIStore();

  if (chainLoading && !status) return null;

  const layers = [
    { key: 'l1' as const, label: 'L1' },
    { key: 'l2' as const, label: 'L2' },
    { key: 'l3' as const, label: 'L3' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        fontSize: 11,
        padding: '4px 0',
        flexWrap: 'wrap',
      }}
    >
      {layers.map(({ key, label }) => {
        const s = status?.[key];
        const ok = s?.ok;
        const color = ok == null ? '#6b7280' : ok ? '#22c55e' : '#ef4444';
        return (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Dot color={color} />
            <span style={{ fontWeight: 600 }}>{label}</span>
            {s?.blockNumber != null && (
              <span style={{ color: '#6b7280' }}>#{s.blockNumber.toLocaleString()}</span>
            )}
          </span>
        );
      })}

      <span style={{ color: '#374151' }}>|</span>

      <AlertBadge level={alertLevel} />

      {pendingRecs.length > 0 && (
        <Link
          href="/ai/recommendations"
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 7px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.2)',
            color: '#ef4444',
            textDecoration: 'none',
          }}
        >
          {pendingRecs.length} AI rec{pendingRecs.length !== 1 ? 's' : ''} pending
        </Link>
      )}
    </div>
  );
}
