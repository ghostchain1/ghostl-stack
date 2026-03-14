'use client';

import { useEffect, useState } from 'react';

type ValidatorEntry = {
  address: string;
  moniker: string;
  power: string;
  uptime: number;
  status: 'active' | 'jailed' | 'inactive';
};

type ApiResponse = {
  validators: ValidatorEntry[];
  totalPower: string;
  activeCount: number;
};

export function ValidatorPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/command-center/validators', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as ApiResponse;
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
    const id = setInterval(() => { void poll(); }, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700 }}>Validators</span>
        {data && (
          <span className="muted" style={{ fontSize: 12 }}>{data.activeCount} active</span>
        )}
      </div>

      {error && (
        <div className="badge bad" style={{ fontSize: 12 }}>Validator API offline — {error}</div>
      )}

      {!data && !error && (
        <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
      )}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>Total Power</div>
              <div style={{ fontFamily: 'monospace' }}>{data.totalPower}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>Validators</div>
              <div>{data.validators.length}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {data.validators.slice(0, 6).map((v) => (
              <div
                key={v.address}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}
              >
                <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                  <span
                    style={{
                      display: 'inline-block', width: 7, height: 7,
                      borderRadius: '50%', flexShrink: 0,
                      background: v.status === 'active' ? '#22c55e' : v.status === 'jailed' ? '#ef4444' : '#6b7280',
                    }}
                  />
                  <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {v.moniker || `${v.address.slice(0, 8)}…${v.address.slice(-4)}`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="muted">{v.uptime}% up</span>
                  {v.status !== 'active' && (
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 99, background: '#fee2e2', color: '#991b1b', fontWeight: 600 }}>
                      {v.status}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {data.validators.length > 6 && (
              <div className="muted" style={{ fontSize: 11 }}>+{data.validators.length - 6} more validators</div>
            )}
          </div>
        </>
      )}

      {lastUpdated && (
        <div className="muted" style={{ fontSize: 11, textAlign: 'right' }}>
          Updated {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
