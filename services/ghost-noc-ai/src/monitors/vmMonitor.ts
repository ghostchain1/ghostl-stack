import type { MonitorResult, NocAlert, NocProposal } from '../types.js';

const INFRA_URL = process.env.INFRA_CONTROLLER_URL ?? 'http://localhost:7940';

function makeAlert(source: string, severity: NocAlert['severity'], message: string, meta?: Record<string, unknown>): NocAlert {
  return {
    id:        `noc-vm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    severity,
    source,
    monitor:   'vmMonitor',
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
    entityType:     'vm',
    target,
    action,
    rationale,
    timestamp:      new Date().toISOString(),
    requiresQuorum: true,
    alertIds,
  };
}

interface RawVM { id: string; name?: string; state: string; cpuPercent?: number; memoryMb?: number; memoryMaxMb?: number }

export async function runVMMonitor(): Promise<MonitorResult> {
  const alerts: NocAlert[] = [];
  const proposals: NocProposal[] = [];

  let vms: RawVM[] = [];
  try {
    const res = await fetch(`${INFRA_URL}/api/v1/vms`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      alerts.push(makeAlert('infra-controller', 'warning', `VM list returned HTTP ${res.status}`));
      return { alerts, proposals };
    }
    const data = await res.json() as { vms: RawVM[] } | RawVM[];
    vms = Array.isArray(data) ? data : (data.vms ?? []);
  } catch (err) {
    alerts.push(makeAlert('infra-controller', 'info', `VM API unreachable: ${err instanceof Error ? err.message : String(err)}`));
    return { alerts, proposals };
  }

  for (const vm of vms) {
    const name = vm.name ?? vm.id;

    if (vm.state === 'crashed' || vm.state === 'paused') {
      const alert = makeAlert(name, 'critical', `VM "${name}" is in state "${vm.state}"`);
      alerts.push(alert);
      proposals.push(makeProposal(vm.id, 'reboot', `VM "${name}" in state ${vm.state}. Propose reboot.`, [alert.id]));
    }

    if (vm.cpuPercent !== undefined && vm.cpuPercent > 90) {
      alerts.push(makeAlert(name, 'warning', `VM "${name}" CPU at ${vm.cpuPercent}% — high CPU usage`));
    }

    if (vm.memoryMb && vm.memoryMaxMb) {
      const pct = (vm.memoryMb / vm.memoryMaxMb) * 100;
      if (pct > 92) {
        alerts.push(makeAlert(name, 'warning', `VM "${name}" memory at ${Math.round(pct)}% of ${vm.memoryMaxMb}MB`));
      }
    }
  }

  return { alerts, proposals };
}
