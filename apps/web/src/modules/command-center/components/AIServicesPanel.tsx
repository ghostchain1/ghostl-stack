'use client';

import { useEffect, useState } from 'react';

type ServiceStatus = {
  name: string;
  port: number;
  healthPath: string;
  status: 'ok' | 'degraded' | 'loading';
  detail?: string;
};

const AI_SERVICES: ServiceStatus[] = [
  { name: 'GhostBrain',          port: 7900, healthPath: '/health',  status: 'loading' },
  { name: 'Protocol Architect',  port: 7910, healthPath: '/healthz', status: 'loading' },
  { name: 'DeFi Architect',      port: 7920, healthPath: '/healthz', status: 'loading' },
  { name: 'Governor AI',         port: 7930, healthPath: '/healthz', status: 'loading' },
  { name: 'Infra Controller',    port: 7940, healthPath: '/healthz', status: 'loading' },
  { name: 'Multichain Ctrl',     port: 7950, healthPath: '/healthz', status: 'loading' },
];

type ApiResponse = {
  services: Array<{ port: number; status: string; detail?: string }>;
};

export function AIServicesPanel() {
  const [services, setServices] = useState<ServiceStatus[]>(AI_SERVICES);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/command-center/ai-services', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as ApiResponse;
        if (!cancelled) {
          setServices(
            AI_SERVICES.map((svc) => {
              const hit = json.services.find((s) => s.port === svc.port);
              return {
                ...svc,
                status: hit?.status === 'ok' ? 'ok' : 'degraded',
                detail: hit?.detail,
              };
            })
          );
          setLastUpdated(new Date());
        }
      } catch {
        if (!cancelled) {
          setServices((prev) => prev.map((s) => ({ ...s, status: 'degraded' as const })));
        }
      }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const okCount = services.filter((s) => s.status === 'ok').length;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700 }}>AI Services</span>
        <span className="muted" style={{ fontSize: 12 }}>{okCount}/{services.length} online</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {services.map((svc) => (
          <div
            key={svc.port}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <ServiceDot status={svc.status} />
              <span>{svc.name}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 11 }}>:{svc.port}</span>
              <StatusBadge status={svc.status} />
            </div>
          </div>
        ))}
      </div>

      {lastUpdated && (
        <div className="muted" style={{ fontSize: 11, textAlign: 'right' }}>
          Updated {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

function ServiceDot({ status }: { status: ServiceStatus['status'] }) {
  const colour =
    status === 'ok'      ? '#22c55e' :
    status === 'degraded'? '#ef4444' :
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

function StatusBadge({ status }: { status: ServiceStatus['status'] }) {
  const colour =
    status === 'ok'      ? '#166534' :
    status === 'degraded'? '#991b1b' :
                           '#374151';
  const bg =
    status === 'ok'      ? '#dcfce7' :
    status === 'degraded'? '#fee2e2' :
                           '#f3f4f6';
  return (
    <span
      style={{
        fontSize: 10, padding: '2px 6px', borderRadius: 99,
        background: bg, color: colour, fontWeight: 600,
      }}
    >
      {status === 'loading' ? '…' : status}
    </span>
  );
}
