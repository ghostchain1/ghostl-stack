import type { BlastRadius, Fix, RankedFixInput } from '../types/hgop.js';

export type FixDraft = Omit<Fix, 'proposal_id' | 'rank' | 'score'> & { score?: number };

export const blastRadiusPenalty = (blast: BlastRadius) => (blast === 'high' ? 25 : blast === 'med' ? 10 : 0);

export const scoreFix = (risk: number, blast: BlastRadius, uncertainty: number, benefit: number) =>
  benefit - risk - blastRadiusPenalty(blast) - uncertainty;

export function commonFixPatterns(input: RankedFixInput): FixDraft[] {
  const scope = input.incident.scope || 'unknown';
  const env = input.incident.env;

  const patterns: FixDraft[] = [];

  // Pattern: restart service (operational, reversible).
  patterns.push({
    fix_id: `fix_restart_${scope.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    description: 'Restart the affected service to clear transient stalls',
    diff_summary: `Operational only. Restart scoped component: ${scope}`,
    risk_score: 10,
    blast_radius: 'low',
    uncertainty: 15,
    expected_benefit: 55,
    rollback_plan_json: { steps: [`restart ${scope} again if needed`, 'inspect logs for regression'] },
    verification_steps_json: [
      { kind: 'probe', probes: ['rpc_l1', 'rpc_l2', 'rpc_l3'] },
      { kind: 'doctor', cmd: scope.includes('l3') ? 'bash infra/scripts/doctor-l3.sh' : 'bash infra/scripts/doctor-l2.sh' }
    ],
    required_gates: env === 'devnet' ? 'devnet_exec' : 'proposal_only'
  });

  // Pattern: increase RPC timeout (small config diff).
  patterns.push({
    fix_id: `fix_increase_rpc_timeout_${scope.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    description: 'Increase RPC timeout for probes/relayers to tolerate transient latency',
    diff_summary: 'Config-only change. Increase HG_PROBE_TIMEOUT_MS or service RPC timeout envs.',
    risk_score: 20,
    blast_radius: 'low',
    uncertainty: 25,
    expected_benefit: 45,
    rollback_plan_json: { steps: ['revert timeout change', 'restart affected service'] },
    verification_steps_json: [{ kind: 'probe', probes: ['rpc_l1', 'rpc_l2', 'rpc_l3'] }],
    required_gates: 'proposal_only'
  });

  // Pattern: reduce concurrency (mitigate overload).
  patterns.push({
    fix_id: `fix_reduce_concurrency_${scope.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    description: 'Reduce worker concurrency to mitigate overload and stabilize throughput',
    diff_summary: 'Config change. Reduce batcher/proposer fetch parallelism or worker concurrency envs.',
    risk_score: 30,
    blast_radius: 'med',
    uncertainty: 25,
    expected_benefit: 55,
    rollback_plan_json: { steps: ['restore previous concurrency values', 'restart service'] },
    verification_steps_json: [{ kind: 'probe', probes: ['rpc_l2', 'rpc_l3'] }],
    required_gates: 'proposal_only'
  });

  // Pattern: clear stuck queue (dev only).
  patterns.push({
    fix_id: `fix_clear_stuck_queue_${scope.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    description: 'Clear a stuck queue cursor safely (dev-only)',
    diff_summary: 'Operational action. Clear/repair cursor state for a stuck pipeline (dev only).',
    risk_score: 40,
    blast_radius: 'high',
    uncertainty: 35,
    expected_benefit: 70,
    rollback_plan_json: { steps: ['restore prior state from backup', 'restart the pipeline'] },
    verification_steps_json: [{ kind: 'doctor', cmd: 'bash infra/scripts/doctor.sh' }],
    required_gates: env === 'devnet' ? 'devnet_exec' : 'blocked'
  });

  // Optional: pause domain (proposal-only; requires on-chain policy).
  patterns.push({
    fix_id: `fix_pause_domain_${scope.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    description: 'Pause affected domain via policy gate (governance-controlled)',
    diff_summary: 'Governance action. Submit a domain pause proposal to the policy registry / timelock.',
    risk_score: 35,
    blast_radius: 'high',
    uncertainty: 20,
    expected_benefit: 65,
    rollback_plan_json: { steps: ['submit unpause proposal', 'verify resumptions'] },
    verification_steps_json: [{ kind: 'governance', action: 'pause_domain' }],
    required_gates: 'proposal_only'
  });

  return patterns;
}

export const blastRank = (b: BlastRadius) => (b === 'low' ? 0 : b === 'med' ? 1 : 2);
