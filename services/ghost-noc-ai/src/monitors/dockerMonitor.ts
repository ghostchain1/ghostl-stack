import type { MonitorResult, NocAlert, NocProposal } from '../types.js';

const GAIS_URL = process.env.GAIS_URL ?? 'http://localhost:9100';

function makeAlert(source: string, severity: NocAlert['severity'], message: string, meta?: Record<string, unknown>): NocAlert {
  return {
    id:        `noc-docker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    severity,
    source,
    monitor:   'dockerMonitor',
    message,
    timestamp: new Date().toISOString(),
    resolved:  false,
    metadata:  meta,
  };
}

function makeProposal(target: string, action: string, rationale: string, alertIds: string[]): NocProposal {
  return {
    id:             `noc-prop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    source:         'ghost-noc-ai',
    type:           'infrastructure_proposal',
    entityType:     'container',
    target,
    action,
    rationale,
    timestamp:      new Date().toISOString(),
    requiresQuorum: true,
    alertIds,
  };
}

interface RawContainer { name?: string; Names?: string[]; state?: string; State?: string; status?: string; Status?: string }

export async function runDockerMonitor(): Promise<MonitorResult> {
  const alerts: NocAlert[] = [];
  const proposals: NocProposal[] = [];

  let containers: RawContainer[] = [];
  try {
    const res = await fetch(`${GAIS_URL}/containers`, { signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      const data = await res.json() as RawContainer[] | { containers: RawContainer[] };
      containers = Array.isArray(data) ? data : (data.containers ?? []);
    } else {
      alerts.push(makeAlert('GAIS', 'warning', `Container list returned HTTP ${res.status}`));
    }
  } catch (err) {
    alerts.push(makeAlert('GAIS', 'warning', `Docker API unreachable: ${err instanceof Error ? err.message : String(err)}`));
    return { alerts, proposals };
  }

  for (const c of containers) {
    const name  = c.name ?? (Array.isArray(c.Names) ? c.Names[0]?.replace(/^\//, '') : undefined) ?? 'unknown';
    const state = (c.state ?? c.State ?? '').toLowerCase();

    if (state === 'exited' || state === 'dead') {
      const alert = makeAlert(name, 'critical', `Container "${name}" is in state "${state}" — may require restart`);
      alerts.push(alert);
      proposals.push(makeProposal(name, 'restart', `Container "${name}" exited unexpectedly. Propose restart.`, [alert.id]));
    } else if (state === 'paused') {
      alerts.push(makeAlert(name, 'warning', `Container "${name}" is paused`));
    }
  }

  return { alerts, proposals };
}
