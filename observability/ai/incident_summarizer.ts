import type { LogIncident, NormalizedLogEvent, LogSeverity } from '@ghostchain/types/observability';

const severityRank: Record<LogSeverity, number> = {
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4,
  SLASHING_RISK: 5,
  CONSENSUS_RISK: 4,
  SECURITY_EVENT: 5,
  AI_DECISION: 1
};

const highestSeverity = (events: NormalizedLogEvent[]): LogSeverity => {
  let highest: LogSeverity = 'INFO';
  events.forEach((event) => {
    if (severityRank[event.severity] > severityRank[highest]) highest = event.severity;
  });
  return highest;
};

export const summarizeLogIncidents = (events: NormalizedLogEvent[]): LogIncident[] => {
  if (!events.length) return [];
  const grouped = new Map<string, NormalizedLogEvent[]>();
  events.forEach((event) => {
    const key = event.traceId || `${event.component}:${event.event}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(event);
  });
  const incidents: LogIncident[] = [];
  grouped.forEach((group, key) => {
    const severity = highestSeverity(group);
    const start = group.reduce((min, event) => (event.timestamp < min ? event.timestamp : min), group[0].timestamp);
    const end = group.reduce((max, event) => (event.timestamp > max ? event.timestamp : max), group[0].timestamp);
    const sample = group[0];
    incidents.push({
      id: key,
      severity,
      title: `${sample.component} ${sample.event}`.slice(0, 120),
      summary: `Observed ${group.length} correlated events`,
      start,
      end,
      layer: sample.layer,
      chain: sample.chain,
      component: sample.component,
      traceId: sample.traceId,
      eventIds: group.map((event) => event.id)
    });
  });
  incidents.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  return incidents;
};
