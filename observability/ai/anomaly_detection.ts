import type { LogAnomaly, NormalizedLogEvent } from '@ghostchain/types/observability';

const severityWeight: Record<string, number> = {
  INFO: 0,
  WARN: 1,
  ERROR: 2,
  CRITICAL: 3,
  SLASHING_RISK: 4,
  CONSENSUS_RISK: 3,
  SECURITY_EVENT: 4,
  AI_DECISION: 0
};

export const detectLogAnomalies = (events: NormalizedLogEvent[]): LogAnomaly[] => {
  if (!events.length) return [];
  const anomalies: LogAnomaly[] = [];
  const now = new Date().toISOString();
  const byComponent: Record<string, { total: number; weighted: number }> = {};
  events.forEach((event) => {
    const entry = byComponent[event.component] || { total: 0, weighted: 0 };
    entry.total += 1;
    entry.weighted += severityWeight[event.severity] || 0;
    byComponent[event.component] = entry;
    if (event.severity === 'SLASHING_RISK' || event.severity === 'SECURITY_EVENT') {
      anomalies.push({
        id: `${event.component}-critical`,
        score: 95,
        reason: `${event.severity} detected`,
        time: event.timestamp,
        layer: event.layer,
        chain: event.chain,
        component: event.component,
        traceId: event.traceId
      });
    }
  });
  Object.entries(byComponent).forEach(([component, stats]) => {
    const ratio = stats.total ? stats.weighted / stats.total : 0;
    if (stats.total >= 8 && ratio >= 1.6) {
      anomalies.push({
        id: `${component}-spike`,
        score: Math.min(90, Math.round(ratio * 40)),
        reason: `Elevated severity density for ${component}`,
        time: now,
        component
      });
    }
  });
  return anomalies;
};
