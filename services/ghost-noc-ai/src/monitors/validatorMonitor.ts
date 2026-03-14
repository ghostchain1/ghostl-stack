import type { MonitorResult, NocAlert } from '../types.js';

const COSMOS_LCD = process.env.COSMOS_LCD_URL ?? 'http://localhost:1317';

function makeAlert(source: string, severity: NocAlert['severity'], message: string): NocAlert {
  return {
    id:        `noc-val-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    severity,
    source,
    monitor:   'validatorMonitor',
    message,
    timestamp: new Date().toISOString(),
    resolved:  false,
  };
}

interface Validator { operator_address: string; description?: { moniker?: string }; status: string; jailed: boolean; tokens?: string }

export async function runValidatorMonitor(): Promise<MonitorResult> {
  const alerts: NocAlert[] = [];

  let validators: Validator[] = [];
  try {
    const res = await fetch(`${COSMOS_LCD}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      if (res.status !== 404) {
        alerts.push(makeAlert('Cosmos LCD', 'warning', `Validator LCD returned HTTP ${res.status}`));
      }
      return { alerts, proposals: [] };
    }
    const data = await res.json() as { validators?: Validator[] };
    validators = data.validators ?? [];
  } catch (err) {
    // LCD may not be running in all envs — suppress noise, emit info-level only
    alerts.push(makeAlert('Cosmos LCD', 'info', `Cosmos LCD unreachable: ${err instanceof Error ? err.message : String(err)}`));
    return { alerts, proposals: [] };
  }

  const jailed = validators.filter((v) => v.jailed);
  for (const v of jailed) {
    const moniker = v.description?.moniker ?? v.operator_address.slice(0, 16);
    alerts.push(makeAlert(moniker, 'critical', `Validator "${moniker}" is jailed — stake: ${v.tokens ?? 'unknown'}`));
  }

  const total = validators.length;
  if (total === 0) {
    alerts.push(makeAlert('GhostChain L1', 'warning', 'No active bonded validators found'));
  } else if (jailed.length > 0) {
    const pct = Math.round((jailed.length / total) * 100);
    if (pct >= 33) {
      alerts.push(makeAlert('GhostChain L1', 'critical', `${pct}% of validators jailed — potential consensus disruption`));
    }
  }

  return { alerts, proposals: [] };
}
