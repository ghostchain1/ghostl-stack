export type HgEnv = 'devnet' | 'testnet' | 'mainnet';

export type Severity = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
export type IncidentStatus = 'open' | 'mitigated' | 'resolved' | 'false_positive';

export type ProposalStatus = 'draft' | 'attested' | 'submitted' | 'executed' | 'rejected';
export type ExecutionOutcome = 'running' | 'success' | 'failed' | 'rolled_back' | 'blocked';

export type BlastRadius = 'low' | 'med' | 'high';

export type Incident = {
  incident_id: string;
  ts: number;
  env: HgEnv;
  scope: string;
  severity: Severity;
  title: string;
  status: IncidentStatus;
  symptoms_json: unknown;
  hypotheses_json: unknown;
  evidence_refs_json: unknown;
};

export type Evidence = {
  evidence_id: string;
  incident_id: string;
  kind: string;
  uri: string;
  sha256: string | null;
  created_ts: number;
};

export type Proposal = {
  proposal_id: string;
  incident_id: string;
  created_ts: number;
  constraints_json: unknown;
  signatures_json: unknown;
  status: ProposalStatus;
};

export type Fix = {
  fix_id: string;
  proposal_id: string;
  rank: number;
  description: string;
  diff_summary: string;
  risk_score: number;
  blast_radius: BlastRadius;
  uncertainty: number;
  expected_benefit: number;
  rollback_plan_json: unknown;
  verification_steps_json: unknown;
  required_gates: string;
  score: number;
};

export type Execution = {
  execution_id: string;
  proposal_id: string;
  fix_id: string;
  started_ts: number;
  finished_ts: number | null;
  outcome: ExecutionOutcome;
  logs_json: unknown;
};

export type PolicyStateSnapshot = {
  snapshot_id: string;
  ts: number;
  env: HgEnv;
  state_json: unknown;
};

export type RuntimeHealthSummary = {
  probes: Array<{
    probe: string;
    ok: boolean;
    latency_ms: number;
    reason?: string;
    detail?: unknown;
    ts: number;
  }>;
};

export type RankedFixInput = {
  incident: Incident;
  evidence: Evidence[];
  constraints: Record<string, unknown>;
  health: RuntimeHealthSummary;
};

