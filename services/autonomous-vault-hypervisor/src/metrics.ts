// metrics.ts — in-memory Prometheus-format metrics exporter

import type { Metrics } from './types.js';

export const metrics: Metrics = {
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
  memoryPressureSamples: 0,
  memorySwapsExecuted: 0,
  memorySwapFailures: 0,
  memoryPressurePublished: 0,
};

export function renderPrometheus(): string {
  const svc = 'avh'; // autonomous_vault_hypervisor abbreviated
  return [
    `# HELP ${svc}_reconcile_runs_total Total reconciliation loop runs`,
    `# TYPE ${svc}_reconcile_runs_total counter`,
    `${svc}_reconcile_runs_total ${metrics.reconcileRuns}`,

    `# HELP ${svc}_vm_discoveries_total Total VM discovery scans`,
    `# TYPE ${svc}_vm_discoveries_total counter`,
    `${svc}_vm_discoveries_total ${metrics.vmDiscoveries}`,

    `# HELP ${svc}_container_discoveries_total Total container discovery scans`,
    `# TYPE ${svc}_container_discoveries_total counter`,
    `${svc}_container_discoveries_total ${metrics.containerDiscoveries}`,

    `# HELP ${svc}_vm_remediations_total Total VM auto-remediations`,
    `# TYPE ${svc}_vm_remediations_total counter`,
    `${svc}_vm_remediations_total ${metrics.vmRemediations}`,

    `# HELP ${svc}_container_remediations_total Total container auto-remediations`,
    `# TYPE ${svc}_container_remediations_total counter`,
    `${svc}_container_remediations_total ${metrics.containerRemediations}`,

    `# HELP ${svc}_secret_rotations_total Total successful secret rotations`,
    `# TYPE ${svc}_secret_rotations_total counter`,
    `${svc}_secret_rotations_total ${metrics.secretRotations}`,

    `# HELP ${svc}_secret_rotation_failures_total Total failed secret rotations`,
    `# TYPE ${svc}_secret_rotation_failures_total counter`,
    `${svc}_secret_rotation_failures_total ${metrics.secretRotationFails}`,

    `# HELP ${svc}_policy_denials_total Total policy-denied actions`,
    `# TYPE ${svc}_policy_denials_total counter`,
    `${svc}_policy_denials_total ${metrics.policyDenials}`,

    `# HELP ${svc}_auth_failures_total Total authentication failures`,
    `# TYPE ${svc}_auth_failures_total counter`,
    `${svc}_auth_failures_total ${metrics.authFailures}`,

    `# HELP ${svc}_anomalies_total Total anomalies detected`,
    `# TYPE ${svc}_anomalies_total counter`,
    `${svc}_anomalies_total ${metrics.anomalies}`,

    `# HELP ${svc}_nats_published_total Total NATS messages published`,
    `# TYPE ${svc}_nats_published_total counter`,
    `${svc}_nats_published_total ${metrics.natsPublished}`,

    `# HELP ${svc}_nats_errors_total Total NATS publish errors`,
    `# TYPE ${svc}_nats_errors_total counter`,
    `${svc}_nats_errors_total ${metrics.natsErrors}`,

    `# HELP ${svc}_api_requests_total Total API HTTP requests`,
    `# TYPE ${svc}_api_requests_total counter`,
    `${svc}_api_requests_total ${metrics.apiRequests}`,

    `# HELP ${svc}_memory_pressure_samples_total Total memory pressure samples collected`,
    `# TYPE ${svc}_memory_pressure_samples_total counter`,
    `${svc}_memory_pressure_samples_total ${metrics.memoryPressureSamples ?? 0}`,

    `# HELP ${svc}_memory_swaps_executed_total Total memory swap operations executed`,
    `# TYPE ${svc}_memory_swaps_executed_total counter`,
    `${svc}_memory_swaps_executed_total ${metrics.memorySwapsExecuted ?? 0}`,

    `# HELP ${svc}_memory_swap_failures_total Total failed memory swap operations`,
    `# TYPE ${svc}_memory_swap_failures_total counter`,
    `${svc}_memory_swap_failures_total ${metrics.memorySwapFailures ?? 0}`,

    `# HELP ${svc}_memory_pressure_published_total Total memory pressure signals published to GhostBrain`,
    `# TYPE ${svc}_memory_pressure_published_total counter`,
    `${svc}_memory_pressure_published_total ${metrics.memoryPressurePublished ?? 0}`,
  ].join('\n');
}
