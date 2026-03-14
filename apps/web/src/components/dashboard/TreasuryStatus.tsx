'use client';

/**
 * TreasuryStatus.tsx — Compact dashboard widget showing GST treasury snapshot.
 * Reads from the global ChainStore (treasury data piggybacked via SSE) and
 * falls back to a direct BFF call.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface TreasurySnap {
  totalGst:          string;
  availableGst:      string;
  lockedGst:         string;
  pendingApprovals:  number;
  last24hInGst:      string | null;
  last24hOutGst:     string | null;
}

export function TreasuryStatus() {
  const [snap,    setSnap]    = useState<TreasurySnap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/treasury/snapshot', { cache: 'no-store' });
        if (res.ok) setSnap(await res.json() as TreasurySnap);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    };
    void load();
    const t = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Treasury (GST)</span>
        <Link href="/treasury" style={{ fontSize: 11, color: 'var(--accent, #6366f1)' }}>
          Full →
        </Link>
      </div>

      {loading && !snap ? (
        <p className="muted" style={{ fontSize: 12 }}>Loading…</p>
      ) : snap ? (
        <div className="stack" style={{ gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 12 }}>Total</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{snap.totalGst}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 12 }}>Available</span>
            <span style={{ fontSize: 13, color: '#22c55e' }}>{snap.availableGst}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 12 }}>Locked</span>
            <span style={{ fontSize: 13, color: '#f59e0b' }}>{snap.lockedGst}</span>
          </div>
          {snap.last24hInGst != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12 }}>24h In</span>
              <span style={{ fontSize: 12, color: '#22c55e' }}>+{snap.last24hInGst}</span>
            </div>
          )}
          {snap.last24hOutGst != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12 }}>24h Out</span>
              <span style={{ fontSize: 12, color: '#ef4444' }}>-{snap.last24hOutGst}</span>
            </div>
          )}
          {snap.pendingApprovals > 0 && (
            <div
              style={{
                marginTop: 4,
                padding: '4px 8px',
                borderRadius: 5,
                background: 'rgba(245,158,11,0.15)',
                border: '1px solid #f59e0b50',
                fontSize: 11,
                color: '#f59e0b',
                fontWeight: 600,
              }}
            >
              {snap.pendingApprovals} approval{snap.pendingApprovals !== 1 ? 's' : ''} pending
            </div>
          )}
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>Unavailable</p>
      )}
    </div>
  );
}
