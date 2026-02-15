import type { Fix, RankedFixInput } from '../types/hgop.js';
import { blastRank, commonFixPatterns, scoreFix, type FixDraft } from './heuristics.js';

export type ScoredFixDraft = FixDraft & { score: number };

export function compareFixDrafts(a: ScoredFixDraft, b: ScoredFixDraft) {
  // Higher score first.
  const scoreDelta = b.score - a.score;
  if (scoreDelta !== 0) return scoreDelta;

  // Tie-breakers (strict).
  if (a.risk_score !== b.risk_score) return a.risk_score - b.risk_score;
  const br = blastRank(a.blast_radius) - blastRank(b.blast_radius);
  if (br !== 0) return br;
  const len = a.diff_summary.length - b.diff_summary.length;
  if (len !== 0) return len;
  return a.fix_id.localeCompare(b.fix_id);
}

export function rankFixes(input: RankedFixInput, proposalId: string): Fix[] {
  const drafts: ScoredFixDraft[] = commonFixPatterns(input).map((d) => ({
    ...d,
    score: scoreFix(d.risk_score, d.blast_radius, d.uncertainty, d.expected_benefit)
  }));

  const sorted = drafts.sort(compareFixDrafts);

  return sorted.map((d, idx) => ({
    fix_id: d.fix_id,
    proposal_id: proposalId,
    rank: idx + 1,
    description: d.description,
    diff_summary: d.diff_summary,
    risk_score: d.risk_score,
    blast_radius: d.blast_radius,
    uncertainty: d.uncertainty,
    expected_benefit: d.expected_benefit,
    rollback_plan_json: d.rollback_plan_json,
    verification_steps_json: d.verification_steps_json,
    required_gates: d.required_gates,
    score: d.score || 0
  }));
}
