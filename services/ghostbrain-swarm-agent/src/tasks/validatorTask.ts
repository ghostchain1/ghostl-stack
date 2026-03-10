// validatorTask — reads real health data from GhostBrain API
// Never uses Math.random(); all values come from live endpoints.
import { publish } from '../communication/swarmBus.js';
import type { SwarmMessage, AlertSeverity } from '../communication/swarmProtocol.js';
import { CONFIG, AGENT_ID } from '../config/agentConfig.js';

interface ValidatorHealth {
  cpu_pct?: number;
  uptime_sec?: number;
  jailed?: boolean;
  missed_blocks?: number;
  block_height?: number;
  status?: string;
}

async function fetchValidatorHealth(): Promise<ValidatorHealth> {
  const resp = await fetch(
    `${CONFIG.ghostbrainUrl}/validators/health?agent=${encodeURIComponent(AGENT_ID)}`,
    { signal: AbortSignal.timeout(8_000) },
  );
  if (!resp.ok) throw new Error(`validators/health ${resp.status}`);
  return resp.json() as Promise<ValidatorHealth>;
}

export async function runValidatorTask(): Promise<void> {
  let health: ValidatorHealth;
  try {
    health = await fetchValidatorHealth();
  } catch (err) {
    console.warn('[validatorTask] fetch failed:', (err as Error).message);
    return;
  }

  const alerts: SwarmMessage[] = [];
  const now = new Date().toISOString();

  // CPU threshold alerts
  if (health.cpu_pct !== undefined) {
    let severity: AlertSeverity | null = null;
    if (health.cpu_pct >= CONFIG.cpuCriticalPct) severity = 'critical';
    else if (health.cpu_pct >= CONFIG.cpuWarningPct) severity = 'warning';

    if (severity) {
      alerts.push({
        agentId: AGENT_ID,
        nodeType: CONFIG.nodeType,
        topic: 'validator.alert',
        severity,
        type: 'high_cpu',
        value: health.cpu_pct,
        detail: `Validator CPU at ${health.cpu_pct.toFixed(1)}% (threshold: ${CONFIG.cpuCriticalPct}%)`,
        payload: { cpu_pct: health.cpu_pct, block_height: health.block_height },
        ts: now,
      });
    }
  }

  // Low uptime / restart detected
  if (health.uptime_sec !== undefined && health.uptime_sec < CONFIG.minUptimeSec) {
    alerts.push({
      agentId: AGENT_ID,
      nodeType: CONFIG.nodeType,
      topic: 'validator.alert',
      severity: 'warning',
      type: 'low_uptime',
      value: health.uptime_sec,
      detail: `Validator uptime ${health.uptime_sec}s — possible recent restart`,
      payload: { uptime_sec: health.uptime_sec },
      ts: now,
    });
  }

  // Jailed validator
  if (health.jailed === true) {
    alerts.push({
      agentId: AGENT_ID,
      nodeType: CONFIG.nodeType,
      topic: 'validator.alert',
      severity: 'critical',
      type: 'validator_jailed',
      detail: 'Validator is currently jailed — investigate missed blocks',
      payload: { jailed: true, missed_blocks: health.missed_blocks ?? 0 },
      ts: now,
    });
  }

  for (const alert of alerts) {
    publish('validator.alert', alert);
    console.info(`[validatorTask] published ${alert.type} (${alert.severity})`);
  }
}
