import type { AIExplanation, NormalizedLogEvent } from '@ghostl/types/observability';

export const analyzeRootCause = (events: NormalizedLogEvent[]): AIExplanation[] => {
  if (!events.length) return [];
  const byComponent: Record<string, number> = {};
  events.forEach((event) => {
    const weight = event.severity === 'CRITICAL' || event.severity === 'SLASHING_RISK' || event.severity === 'SECURITY_EVENT' ? 4
      : event.severity === 'ERROR' || event.severity === 'CONSENSUS_RISK' ? 2
      : 1;
    byComponent[event.component] = (byComponent[event.component] || 0) + weight;
  });
  const ranked = Object.entries(byComponent).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) return [];
  return [
    {
      id: `root-cause-${top[0]}`,
      summary: `Most error density seen on ${top[0]}`,
      confidence: 0.62,
      evidence: ranked.slice(0, 4).map(([component, score]) => `${component}:${score}`)
    }
  ];
};
