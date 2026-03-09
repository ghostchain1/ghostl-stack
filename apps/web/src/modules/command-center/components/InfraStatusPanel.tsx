'use client';

import { useEffect, useState } from 'react';

type ContainerEntry = {
  id: string;
  name: string;
  status: string;
  health: 'healthy' | 'unhealthy' | 'unknown';
};

type InfraState = {
  containers: ContainerEntry[];
  vmCount: number;
  region: string;
  uptime: string;
} | null;

export function InfraStatusPanel() {
  const [infra, setInfra] = useState<InfraState>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/command-center/infra', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as InfraState;
        if (!cancelled) {
          setInfra(json);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unreachable');
        }
      }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700 }}>Infrastructure</span>
        {infra && (
          <span className="muted" style={{ fontSize: 12 }}>
            {infra.containers.filter((c) => c.health === 'healthy').length}/{infra.containers.length} healthy
          </span>
        )}
      </div>

      {error && (
        <div className="badge bad" style={{ fontSize: 12 }}>Infra controller offline — {error}</div>
      )}

      {!infra && !error && (
        <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
      )}

      {infra && (
        <>
          <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>Region</div>
              <div>{infra.region}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>VMs</div>
              <div>{infra.vmCount}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>Uptime</div>
              <div>{infra.uptime}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {infra.containers.slice(0, 8).map((c) => (
              <div
                key={c.id}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}
              >
                <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                  <HealthDot health={c.health} />
                  <span style={{ fontFamily: 'monospace' }}>{c.name}</span>
                </div>
                <span className="muted">{c.status}</span>
              </div>
            ))}
            {infra.containers.length > 8 && (
              <div className="muted" style={{ fontSize: 11 }}>+{infra.containers.length - 8} more</div>
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

function HealthDot({ health }: { health: ContainerEntry['health'] }) {
  const colour =
    health === 'healthy'   ? '#22c55e' :
    health === 'unhealthy' ? '#ef4444' :
                             '#6b7280';
  return (
    <span
      style={{
        display: 'inline-block', width: 7, height: 7,
        borderRadius: '50%', background: colour, flexShrink: 0,
      }}
    />
  );
}
