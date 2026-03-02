/**
 * GhostBrain Core — Incident Store
 *
 * Persists and retrieves incidents, plans, and evidence evidence to Postgres.
 * All writes produce audit log entries.
 */

import { v4 as uuidv4 } from "uuid";
import { query, transaction } from "../connectors/db.js";
import type { Incident, IncidentSeverity, IncidentStatus, HealthSignal, EvidenceRef } from "../types.js";
import { logger } from "../logger.js";

// ─── Incidents ────────────────────────────────────────────────────────────────
export async function openIncident(
  severity: IncidentSeverity,
  title: string,
  description: string,
  signals: HealthSignal[] = [],
): Promise<Incident> {
  const incident: Incident = {
    incidentId: uuidv4(),
    openedAt:   new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
    severity,
    status:     "open",
    title,
    description,
    signals,
    evidenceRefs: [],
  };

  await query(
    `INSERT INTO incidents (incident_id, severity, status, title, description, signals)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [incident.incidentId, incident.severity, incident.status, incident.title, incident.description, JSON.stringify(incident.signals)]
  );

  await _auditLog("ghostbrain-core", "incident.open", "incident", incident.incidentId, { severity, title });
  logger.info("Incident opened", { incidentId: incident.incidentId, severity, title });
  return incident;
}

export async function updateIncidentStatus(
  incidentId: string,
  status: IncidentStatus,
  extras: { planId?: string; rootCause?: string } = {},
): Promise<void> {
  await transaction(async client => {
    await client.query(
      `UPDATE incidents SET status=$1, updated_at=NOW(), plan_id=COALESCE($2, plan_id), root_cause=COALESCE($3, root_cause)
       WHERE incident_id=$4`,
      [status, extras.planId ?? null, extras.rootCause ?? null, incidentId]
    );
    if (status === "resolved" || status === "rolled-back") {
      await client.query(
        `UPDATE incidents SET resolved_at=NOW() WHERE incident_id=$1`,
        [incidentId]
      );
    }
  });

  await _auditLog("ghostbrain-core", `incident.${status}`, "incident", incidentId, extras);
  logger.info("Incident status updated", { incidentId, status });
}

export async function getIncident(incidentId: string): Promise<Incident | null> {
  const res = await query<Record<string, unknown>>(
    `SELECT * FROM incidents WHERE incident_id=$1`,
    [incidentId]
  );
  return res.rows[0] ? _rowToIncident(res.rows[0]) : null;
}

export async function getOpenIncidents(limit = 50): Promise<Incident[]> {
  const res = await query<Record<string, unknown>>(
    `SELECT * FROM incidents WHERE status NOT IN ('resolved','rolled-back')
     ORDER BY opened_at DESC LIMIT $1`,
    [limit]
  );
  return res.rows.map(_rowToIncident);
}

function _rowToIncident(row: Record<string, unknown>): Incident {
  return {
    incidentId:   row["incident_id"] as string,
    openedAt:     (row["opened_at"] as Date).toISOString(),
    updatedAt:    (row["updated_at"] as Date).toISOString(),
    severity:     row["severity"] as IncidentSeverity,
    status:       row["status"] as IncidentStatus,
    title:        row["title"] as string,
    description:  row["description"] as string,
    signals:      row["signals"] as HealthSignal[],
    evidenceRefs: row["evidence_refs"] as EvidenceRef[],
    ...(row["plan_id"]    ? { planId:    row["plan_id"] as string }    : {}),
    ...(row["root_cause"] ? { rootCause: row["root_cause"] as string } : {}),
  };
}

// ─── Evidence ─────────────────────────────────────────────────────────────────
export async function storeEvidence(
  kind: EvidenceRef["kind"],
  description: string,
  payload: unknown,
  opts: { incidentId?: string; planId?: string } = {},
): Promise<EvidenceRef> {
  const ref: EvidenceRef = {
    evidenceId:  uuidv4(),
    kind,
    description,
    storedAt:    new Date().toISOString(),
    payload,
  };

  await query(
    `INSERT INTO evidence (evidence_id, incident_id, plan_id, kind, description, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ref.evidenceId, opts.incidentId ?? null, opts.planId ?? null, kind, description, JSON.stringify(payload)]
  );

  return ref;
}

// ─── Audit log ────────────────────────────────────────────────────────────────
async function _auditLog(
  actor: string,
  action: string,
  resourceType: string,
  resourceId: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await query(
    `INSERT INTO audit_log (actor, action, resource_type, resource_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actor, action, resourceType, resourceId, JSON.stringify(details)]
  );
}

export { _auditLog as auditLog };
