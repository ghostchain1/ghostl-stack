/**
 * GhostBrain Core — Memory Retrieval (Learning Layer)
 *
 * Finds past incidents, successful fix patterns, and root-cause fingerprints
 * to inform the Planner. All learning produces proposals, never silent mutations.
 */

import { query } from "../connectors/db.js";
import type { Incident } from "../types.js";
import { logger } from "../logger.js";

export interface IncidentPattern {
  title: string;
  severity: string;
  rootCause: string;
  resolvedCount: number;
  successfulPlanRationale: string;
}

/**
 * Find historical incidents matching a similarity heuristic.
 * Currently: title/description text overlap (keyword search).
 * Production upgrade: use pgvector embeddings.
 */
export async function findSimilarIncidents(
  keywords: string[],
  limit = 5,
): Promise<Incident[]> {
  if (keywords.length === 0) return [];

  // Build a LIKE-based keyword search across title + description
  const conditions = keywords.map((_, i) =>
    `(title ILIKE $${i + 1} OR description ILIKE $${i + 1})`
  );
  const params = keywords.map(k => `%${k}%`);

  const res = await query<Record<string, unknown>>(
    `SELECT * FROM incidents
     WHERE status = 'resolved'
       AND (${conditions.join(" OR ")})
     ORDER BY resolved_at DESC
     LIMIT ${limit}`,
    params
  );

  logger.debug("Similar incidents found", { count: res.rowCount, keywords });
  return res.rows.map(row => ({
    incidentId:   row["incident_id"] as string,
    openedAt:     (row["opened_at"] as Date).toISOString(),
    updatedAt:    (row["updated_at"] as Date).toISOString(),
    severity:     row["severity"] as Incident["severity"],
    status:       "resolved" as const,
    title:        row["title"] as string,
    description:  row["description"] as string,
    signals:      row["signals"] as Incident["signals"],
    evidenceRefs: row["evidence_refs"] as Incident["evidenceRefs"],
    ...(row["plan_id"]    ? { planId:    row["plan_id"] as string }    : {}),
    ...(row["root_cause"] ? { rootCause: row["root_cause"] as string } : {}),
  }));
}

/**
 * Retrieve recurring patterns from resolved incidents.
 * Used by the Planner to recognise known-good fix strategies.
 */
export async function getRecurringPatterns(limit = 10): Promise<IncidentPattern[]> {
  const res = await query<Record<string, unknown>>(
    `SELECT
       title,
       severity,
       root_cause,
       COUNT(*) AS resolved_count,
       MAX(CASE WHEN plan_id IS NOT NULL THEN plan_id END) AS last_plan_id
     FROM incidents
     WHERE status = 'resolved' AND root_cause IS NOT NULL
     GROUP BY title, severity, root_cause
     HAVING COUNT(*) > 1
     ORDER BY resolved_count DESC
     LIMIT $1`,
    [limit]
  );

  const patterns: IncidentPattern[] = [];

  for (const row of res.rows) {
    let rationale = "Previously resolved via known runbook.";
    const planId = row["last_plan_id"] as string | null;
    if (planId) {
      const planRes = await query<Record<string, unknown>>(
        `SELECT rationale FROM change_plans WHERE plan_id=$1`,
        [planId]
      );
      if (planRes.rows[0]) {
        rationale = planRes.rows[0]["rationale"] as string;
      }
    }

    patterns.push({
      title:                    row["title"] as string,
      severity:                 row["severity"] as string,
      rootCause:                row["root_cause"] as string,
      resolvedCount:            Number(row["resolved_count"]),
      successfulPlanRationale:  rationale,
    });
  }

  return patterns;
}

/**
 * Retrieve a resolved incident's successful plan steps for re-use.
 */
export async function getSuccessfulPlanForIncident(
  incidentTitle: string,
): Promise<{ rationale: string; steps: unknown[] } | null> {
  const res = await query<Record<string, unknown>>(
    `SELECT cp.rationale, cp.steps
     FROM change_plans cp
     JOIN incidents i ON cp.incident_id = i.incident_id
     WHERE i.title ILIKE $1
       AND cp.status = 'completed'
     ORDER BY cp.completed_at DESC
     LIMIT 1`,
    [`%${incidentTitle}%`]
  );

  if (!res.rows[0]) return null;
  return {
    rationale: res.rows[0]["rationale"] as string,
    steps:     res.rows[0]["steps"] as unknown[],
  };
}
