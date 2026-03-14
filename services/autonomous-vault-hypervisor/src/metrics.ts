// metrics.ts — in-process counters for autonomous-vault-hypervisor

export const metrics = {
  reconcileRuns: 0,
  vmDiscoveries: 0,
  containerDiscoveries: 0,
  vmRemediations: 0,
  containerRemediations: 0,
  secretRotations: 0,
  secretRotationFails: 0,
  policyDenials: 0,
  authFailures: 0,
  anomalies: 0,
  natsPublished: 0,
  natsErrors: 0,
  apiRequests: 0,
  memoryPressurePublished: 0,
};

export function renderPrometheus(): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(metrics)) {
    const name = `avh_${key}`;
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name} ${value}`);
  }
  return lines.join('\n') + '\n';
}
