import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();
collectDefaultMetrics({ register });

export const decisionCounter = new Counter({
  name: 'ghost_compliance_decisions_total',
  help: 'Compliance decisions by outcome and action',
  labelNames: ['decision', 'action']
});

export const decisionLatency = new Histogram({
  name: 'ghost_compliance_decision_latency_ms',
  help: 'Decision evaluation latency in ms',
  labelNames: ['action'],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2000]
});

register.registerMetric(decisionCounter);
register.registerMetric(decisionLatency);

export const metricsHandler = async (): Promise<string> => {
  return register.metrics();
};
