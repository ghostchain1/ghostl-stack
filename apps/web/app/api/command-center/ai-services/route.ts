import { NextResponse } from 'next/server';

const AI_SERVICES = [
  { name: 'GhostBrain',          port: 7900, path: '/health'  },
  { name: 'Protocol Architect',  port: 7910, path: '/healthz' },
  { name: 'DeFi Architect',      port: 7920, path: '/healthz' },
  { name: 'Governor AI',         port: 7930, path: '/healthz' },
  { name: 'Infra Controller',    port: 7940, path: '/healthz' },
  { name: 'Multichain Ctrl',     port: 7950, path: '/healthz' },
] as const;

type ServiceResult = {
  name: string;
  port: number;
  status: 'ok' | 'degraded';
  detail?: string;
};

async function checkService(svc: (typeof AI_SERVICES)[number]): Promise<ServiceResult> {
  const start = Date.now();
  try {
    const res = await fetch(`http://localhost:${svc.port}${svc.path}`, {
      signal: AbortSignal.timeout(3_000),
    });
    const latencyMs = Date.now() - start;
    return {
      name: svc.name,
      port: svc.port,
      status: res.ok ? 'ok' : 'degraded',
      detail: res.ok ? `${latencyMs}ms` : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      name: svc.name,
      port: svc.port,
      status: 'degraded',
      detail: err instanceof Error ? err.message : 'timeout',
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const services = await Promise.all(AI_SERVICES.map(checkService));
  return NextResponse.json({ services });
}
