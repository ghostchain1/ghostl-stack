import crypto from 'node:crypto';
import type { SqliteDb } from '../db/sqlite.js';
import type { Evidence, Fix, Incident, Proposal, RuntimeHealthSummary } from '../types/hgop.js';
import { rankFixes } from '../ranking/ranker.js';

const now = () => Math.floor(Date.now() / 1000);

const jsonParse = <T>(raw: string): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return JSON.parse('{}') as T;
  }
};

const normalizeIncident = (row: any): Incident => ({
  incident_id: String(row.incident_id),
  ts: Number(row.ts),
  env: row.env,
  scope: String(row.scope),
  severity: row.severity,
  title: String(row.title),
  status: row.status,
  symptoms_json: jsonParse(row.symptoms_json),
  hypotheses_json: jsonParse(row.hypotheses_json),
  evidence_refs_json: jsonParse(row.evidence_refs_json)
});

const normalizeEvidence = (row: any): Evidence => ({
  evidence_id: String(row.evidence_id),
  incident_id: String(row.incident_id),
  kind: String(row.kind),
  uri: String(row.uri),
  sha256: row.sha256 ? String(row.sha256) : null,
  created_ts: Number(row.created_ts)
});

const normalizeProposal = (row: any): Proposal => ({
  proposal_id: String(row.proposal_id),
  incident_id: String(row.incident_id),
  created_ts: Number(row.created_ts),
  constraints_json: jsonParse(row.constraints_json),
  signatures_json: jsonParse(row.signatures_json),
  status: row.status
});

export function fetchIncident(db: SqliteDb, incidentId: string): Incident | null {
  const row = db.prepare('SELECT * FROM incidents WHERE incident_id = ?').get(incidentId) as any;
  if (!row) return null;
  return normalizeIncident(row);
}

export function fetchEvidence(db: SqliteDb, incidentId: string): Evidence[] {
  const rows = db.prepare('SELECT * FROM evidence WHERE incident_id = ? ORDER BY created_ts DESC').all(incidentId) as any[];
  return rows.map(normalizeEvidence);
}

export function fetchProposal(db: SqliteDb, proposalId: string): Proposal | null {
  const row = db.prepare('SELECT * FROM proposals WHERE proposal_id = ?').get(proposalId) as any;
  if (!row) return null;
  return normalizeProposal(row);
}

export function fetchFixes(db: SqliteDb, proposalId: string): Fix[] {
  const rows = db.prepare('SELECT * FROM fixes WHERE proposal_id = ? ORDER BY rank ASC').all(proposalId) as any[];
  return rows.map((r) => ({
    fix_id: String(r.fix_id),
    proposal_id: String(r.proposal_id),
    rank: Number(r.rank),
    description: String(r.description),
    diff_summary: String(r.diff_summary),
    risk_score: Number(r.risk_score),
    blast_radius: r.blast_radius,
    uncertainty: Number(r.uncertainty),
    expected_benefit: Number(r.expected_benefit),
    rollback_plan_json: jsonParse(r.rollback_plan_json),
    verification_steps_json: jsonParse(r.verification_steps_json),
    required_gates: String(r.required_gates),
    score: Number(r.score)
  }));
}

export function generateProposal(db: SqliteDb, incidentId: string, constraints: Record<string, unknown>, health: RuntimeHealthSummary) {
  const incident = fetchIncident(db, incidentId);
  if (!incident) throw new Error('incident_not_found');
  const evidence = fetchEvidence(db, incidentId);

  const proposalId = `prop_${crypto.randomUUID()}`;
  const proposalRow = {
    proposal_id: proposalId,
    incident_id: incidentId,
    created_ts: now(),
    constraints_json: JSON.stringify(constraints || {}),
    signatures_json: JSON.stringify({}),
    status: 'draft'
  };

  const fixes = rankFixes(
    { incident, evidence, constraints, health },
    proposalId
  );

  db.transaction(() => {
    db.prepare(
      `INSERT INTO proposals (proposal_id, incident_id, created_ts, constraints_json, signatures_json, status)
       VALUES (@proposal_id, @incident_id, @created_ts, @constraints_json, @signatures_json, @status)`
    ).run(proposalRow);

    const stmt = db.prepare(
      `INSERT INTO fixes (
        fix_id, proposal_id, rank, description, diff_summary, risk_score, blast_radius, uncertainty, expected_benefit,
        rollback_plan_json, verification_steps_json, required_gates, score
      ) VALUES (
        @fix_id, @proposal_id, @rank, @description, @diff_summary, @risk_score, @blast_radius, @uncertainty, @expected_benefit,
        @rollback_plan_json, @verification_steps_json, @required_gates, @score
      )`
    );
    for (const f of fixes) {
      stmt.run({
        ...f,
        rollback_plan_json: JSON.stringify(f.rollback_plan_json || {}),
        verification_steps_json: JSON.stringify(f.verification_steps_json || [])
      });
    }
  })();

  const proposal = fetchProposal(db, proposalId);
  if (!proposal) throw new Error('proposal_insert_failed');
  return { proposal, incident, evidence, fixes };
}
