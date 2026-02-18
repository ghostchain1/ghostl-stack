import type { IncidentRow } from "../incidents/db.ts";

export type RiskBudget = "LOW" | "MED" | "HIGH";
export type SeverityLike = number | "info" | "warn" | "error" | "critical";

export interface PatchCandidate {
  id: string;
  incidentId: number;
  summary: string;
  severity: SeverityLike;
  blastRadius: number;
  timeToFixMinutes: number;
  testability: number;
  riskPenalty: number;
  diffRef?: string;
}

export interface RankedPatch extends PatchCandidate {
  rank: number;
  score: number;
  rationale: string;
  breakdown: {
    severityWeight: number;
    severityScore: number;
    blastRadiusInverse: number;
    timeToFixInverse: number;
    testability: number;
    riskPenalty: number;
  };
}

function severityToNumber(severity: SeverityLike): number {
  if (typeof severity === "number") return Math.max(1, Math.min(4, severity));
  if (severity === "critical") return 4;
  if (severity === "error") return 3;
  if (severity === "warn") return 2;
  return 1;
}

function toRiskLabel(candidate: PatchCandidate): "LOW" | "MED" | "HIGH" {
  if (candidate.riskPenalty <= 0.8) return "LOW";
  if (candidate.riskPenalty <= 1.6) return "MED";
  return "HIGH";
}

export function scorePatch(
  candidate: PatchCandidate,
  severityWeight = 3,
): RankedPatch["breakdown"] & { score: number } {
  const severityScore = severityToNumber(candidate.severity);
  const blastRadiusInverse = 1 / Math.max(1, candidate.blastRadius);
  const timeToFixInverse = 1 / Math.max(1, candidate.timeToFixMinutes);

  const score =
    severityWeight * severityScore +
    blastRadiusInverse +
    timeToFixInverse +
    candidate.testability -
    candidate.riskPenalty;

  return {
    score: Number(score.toFixed(6)),
    severityWeight,
    severityScore,
    blastRadiusInverse: Number(blastRadiusInverse.toFixed(6)),
    timeToFixInverse: Number(timeToFixInverse.toFixed(6)),
    testability: Number(candidate.testability.toFixed(6)),
    riskPenalty: Number(candidate.riskPenalty.toFixed(6)),
  };
}

export function rankPatches(
  candidates: PatchCandidate[],
  opts: { severityWeight?: number; limit?: number } = {},
): RankedPatch[] {
  const severityWeight = opts.severityWeight ?? 3;
  const limit = opts.limit ?? 5;

  return candidates
    .map((candidate) => {
      const breakdown = scorePatch(candidate, severityWeight);
      const risk = toRiskLabel(candidate);
      return {
        ...candidate,
        score: breakdown.score,
        rank: 0,
        breakdown,
        rationale:
          `risk=${risk}; severity=${breakdown.severityScore};` +
          ` blast_radius_inverse=${breakdown.blastRadiusInverse};` +
          ` time_to_fix_inverse=${breakdown.timeToFixInverse};` +
          ` testability=${breakdown.testability};` +
          ` risk_penalty=${breakdown.riskPenalty}`,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((ranked, idx) => ({ ...ranked, rank: idx + 1 }));
}

export function candidateFitsRiskBudget(candidate: PatchCandidate, budget: RiskBudget): boolean {
  if (budget === "LOW") return candidate.riskPenalty <= 0.9;
  if (budget === "MED") return candidate.riskPenalty <= 1.7;
  return true;
}

export function deriveCandidatesFromIncidents(incidents: IncidentRow[]): PatchCandidate[] {
  return incidents.map((incident) => {
    const severity = severityToNumber(incident.severity);
    const blastRadius = Math.max(1, severity - 1);
    const timeToFixMinutes = severity >= 4 ? 20 : severity >= 3 ? 30 : 45;
    const testability = severity >= 3 ? 0.9 : 0.75;
    const riskPenalty = severity >= 4 ? 1.2 : severity >= 3 ? 0.9 : 0.6;

    return {
      id: `incident-${incident.id}`,
      incidentId: incident.id,
      summary: `${incident.service}: ${incident.summary}`,
      severity,
      blastRadius,
      timeToFixMinutes,
      testability,
      riskPenalty,
    };
  });
}
