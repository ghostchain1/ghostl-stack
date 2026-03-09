'use client';

import { useEffect, useState } from 'react';

type TreasuryData = {
  balance: string;
  balanceFormatted: string;
  pendingRewards: string;
  totalDistributed: string;
  lastDistributionBlock: number;
  reserveRatio: number;
};

export function TreasuryPanel() {
  const [data, setData] = useState<TreasuryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/command-center/treasury', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as TreasuryData;
        if (!cancelled) {
          setData(json);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unreachable');
      }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700 }}>Ghost Treasury</span>
        {data && (
          <span
            style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 99,
              background: data.reserveRatio >= 80 ? '#dcfce7' : data.reserveRatio >= 50 ? '#fef9c3' : '#fee2e2',
              color: data.reserveRatio >= 80 ? '#166534' : data.reserveRatio >= 50 ? '#854d0e' : '#991b1b',
              fontWeight: 600,
            }}
          >
            {data.reserveRatio}% reserve
          </span>
        )}
      </div>

      {error && (
        <div className="badge bad" style={{ fontSize: 12 }}>Treasury engine offline — {error}</div>
      )}

      {!data && !error && (
        <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div className="muted" style={{ fontSize: 11 }}>Balance</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace' }}>
              {data.balanceFormatted} GST
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>Pending Rewards</div>
              <div style={{ fontFamily: 'monospace' }}>{data.pendingRewards} GST</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>Total Distributed</div>
              <div style={{ fontFamily: 'monospace' }}>{data.totalDistributed} GST</div>
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 11 }}>Last Distribution Block</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13 }}>#{data.lastDistributionBlock.toLocaleString()}</div>
          </div>
        </div>
      )}

      {lastUpdated && (
        <div className="muted" style={{ fontSize: 11, textAlign: 'right' }}>
          Updated {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
