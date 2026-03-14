/**
 * @file src/agent/roles/diagnostician.js
 * @description Diagnoses findings from tool scan results.
 * Produces a structured set of classified incidents for the Planner.
 */

const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

/**
 * Classify a single raw finding into a canonical incident.
 * @param {{ severity: string, name: string, description: string, category?: string, tool?: string }} f
 * @param {string} [correlationId]
 * @returns {object}
 */
export function classifyFinding(f, correlationId) {
  const sev = (f.severity ?? 'low').toLowerCase();
  let category = f.category ?? 'unknown';

  // Heuristic classification
  if (f.tool === 'npm-audit' || /vuln|CVE|advisory/i.test(f.description)) category = 'security';
  else if (/brand|GST|Ghost|ETH|symbol|decimals/i.test(f.description))      category = 'branding';
  else if (/routing|L3|L2|L1|bypass/i.test(f.description))                 category = 'governance';
  else if (/lint|eslint|type|unused/i.test(f.description))                   category = 'stability';
  else if (/perf|timeout|memory|cpu|latency/i.test(f.description))           category = 'performance';

  return {
    incidentId:     `gsa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    correlationId,
    severity:       sev,
    severityScore:  SEVERITY_ORDER[sev] ?? 0,
    category,
    title:          f.name ?? f.description?.slice(0, 80),
    description:    f.description ?? '',
    source:         f.tool ?? 'unknown',
    detectedAt:     new Date().toISOString(),
    status:         'open',
  };
}

/**
 * Diagnose a full scan result set.
 * @param {object} scanResults
 * @returns {{ incidents: object[], summary: object }}
 */
export function diagnose(scanResults) {
  const { npmFindings = [], semgrepFindings = [], lintFindings = [], brandFindings = [] } = scanResults;

  const all = [
    ...npmFindings.map(f => classifyFinding({ ...f, tool: 'npm-audit' })),
    ...semgrepFindings.map(f => classifyFinding({ ...f, tool: 'semgrep' })),
    ...lintFindings.map(f => classifyFinding({ ...f, category: 'stability', tool: 'eslint' })),
    ...brandFindings.map(f => classifyFinding({ ...f, category: 'branding', tool: 'brand-enforcer' })),
  ].sort((a, b) => b.severityScore - a.severityScore);

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of all) {
    if (bySeverity[i.severity] !== undefined) bySeverity[i.severity]++;
  }

  return {
    incidents: all,
    summary: {
      total: all.length,
      bySeverity,
      hasCritical: bySeverity.critical > 0,
      hasHigh:     bySeverity.high > 0,
    },
  };
}
