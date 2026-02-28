import { openIncidentDb, listOpenIncidents, type IncidentRow } from "./incidents/db.ts";
import {
  candidateFitsRiskBudget,
  deriveCandidatesFromIncidents,
  rankPatches,
  type RiskBudget,
} from "./patches/ranker.ts";

export interface RankedRecommendation {
  rank: number;
  incidentId: number;
  severity: number;
  severityLabel: "info" | "warn" | "error" | "critical";
  risk: "LOW" | "MED" | "HIGH";
  score: number;
  summary: string;
  rationale: string;
}

const severityLabel = (value: number): "info" | "warn" | "error" | "critical" => {
  if (value >= 4) return "critical";
  if (value >= 3) return "error";
  if (value >= 2) return "warn";
  return "info";
};

const riskFromPenalty = (penalty: number): "LOW" | "MED" | "HIGH" => {
  if (penalty <= 0.8) return "LOW";
  if (penalty <= 1.6) return "MED";
  return "HIGH";
};

export function rankIncidentRecommendations(
  params: { dbPath?: string; riskBudget?: RiskBudget; limit?: number } = {},
): RankedRecommendation[] {
  const riskBudget = params.riskBudget ?? "MED";
  const limit = params.limit ?? 8;

  const db = openIncidentDb(params.dbPath);
  const incidents = listOpenIncidents(db, 500);
  const candidates = deriveCandidatesFromIncidents(incidents).filter((candidate) =>
    candidateFitsRiskBudget(candidate, riskBudget),
  );
  const ranked = rankPatches(candidates, { limit, severityWeight: 4 });

  return ranked.map((entry) => ({
    rank: entry.rank,
    incidentId: entry.incidentId,
    severity:
      typeof entry.severity === "number" ? entry.severity : entry.breakdown.severityScore,
    severityLabel:
      typeof entry.severity === "number"
        ? severityLabel(entry.severity)
        : severityLabel(entry.breakdown.severityScore),
    risk: riskFromPenalty(entry.riskPenalty),
    score: entry.score,
    summary: entry.summary,
    rationale: entry.rationale,
  }));
}

export function summarizeIncidentsBySeverity(incidents: IncidentRow[]): Record<string, number> {
  const summary: Record<string, number> = {
    critical: 0,
    error: 0,
    warn: 0,
    info: 0,
  };

  for (const incident of incidents) {
    const label = severityLabel(incident.severity);
    summary[label] = (summary[label] ?? 0) + 1;
  }

  return summary;
}

