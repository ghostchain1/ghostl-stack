import type { MonitorResult, NocAlert } from '../types.js';

const AI_SERVICES = [
  { name: 'GhostBrain Core',  url: process.env.GHOSTBRAIN_INTERNAL   ?? 'http://localhost:7900', path: '/healthz' },
  { name: 'Signing Relay',    url: process.env.SIGNING_RELAY_URL      ?? 'http://localhost:7910', path: '/healthz' },
  { name: 'AI Consensus',     url: process.env.AI_CONSENSUS_URL       ?? 'http://localhost:7920', path: '/healthz' },
  { name: 'Ghost Oracle',     url: process.env.GHOST_ORACLE_URL       ?? 'http://localhost:7930', path: '/healthz' },
  { name: 'Infra Controller', url: process.env.INFRA_CONTROLLER_URL   ?? 'http://localhost:7940', path: '/health' },
];

function makeAlert(source: string, severity: NocAlert['severity'], message: string): NocAlert {
  return {
    id:        `noc-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    severity,
    source,
    monitor:   'nodeMonitor',
    message,
    timestamp: new Date().toISOString(),
    resolved:  false,
  };
}

async function checkService(name: string, baseUrl: string, path: string): Promise<NocAlert | null> {
  try {
    const res = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) {
      return makeAlert(name, 'warning', `${name} health check returned HTTP ${res.status}`);
    }
    return null;
  } catch {
    return makeAlert(name, 'critical', `${name} is unreachable`);
  }
}

export async function runNodeMonitor(): Promise<MonitorResult> {
  const results = await Promise.all(
    AI_SERVICES.map((s) => checkService(s.name, s.url, s.path)),
  );

  const alerts = results.filter((a): a is NocAlert => a !== null);
  return { alerts, proposals: [] };
}
