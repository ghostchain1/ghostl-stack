import { Counter, Gauge, Registry } from 'prom-client';

export const registry = new Registry();
registry.setDefaultLabels({ service: 'ghost-noc-ai' });

export const alertsTotal = new Counter({
  name:    'noc_alerts_total',
  help:    'Total alerts emitted by NOC AI monitors',
  labelNames: ['monitor', 'severity'] as const,
  registers: [registry],
});

export const proposalsTotal = new Counter({
  name:    'noc_proposals_total',
  help:    'Total proposals submitted to signing relay',
  labelNames: ['monitor', 'action'] as const,
  registers: [registry],
});

export const monitorRunTotal = new Counter({
  name:    'noc_monitor_runs_total',
  help:    'Total number of monitor poll iterations',
  labelNames: ['monitor'] as const,
  registers: [registry],
});

export const monitorErrorTotal = new Counter({
  name:    'noc_monitor_errors_total',
  help:    'Total number of errors during monitor polls',
  labelNames: ['monitor'] as const,
  registers: [registry],
});

export const activeAlertsGauge = new Gauge({
  name:    'noc_active_alerts',
  help:    'Number of currently unresolved alerts',
  registers: [registry],
});
