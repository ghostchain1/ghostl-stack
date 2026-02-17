import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type CheckpointDecision = "ADVANCE" | "ROLLBACK" | "HOLD";

export interface IncidentRow {
  id: number;
  created_at: string;
  severity: number;
  service: string;
  summary: string;
  symptoms: string;
  logs_ref: string | null;
  signature: string;
  status: "open" | "mitigated" | "closed";
}

export interface PatchRow {
  id: number;
  incident_id: number;
  created_at: string;
  risk: "LOW" | "MED" | "HIGH";
  impact: number;
  rationale: string;
  diff_ref: string | null;
  score: number | null;
  status: "proposed" | "applied" | "reverted";
}

export const DEFAULT_INCIDENT_DB_PATH =
  "/home/ghost/ghostl-stack/tools/ghostcontrol/incidents/incidents.db";

export function resolveIncidentDbPath(dbPath?: string): string {
  const configured = dbPath ?? process.env.GHOSTCONTROL_INCIDENT_DB_PATH;
  return path.resolve(configured ?? DEFAULT_INCIDENT_DB_PATH);
}

export function openIncidentDb(dbPath?: string): DatabaseSync {
  const resolved = resolveIncidentDbPath(dbPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new DatabaseSync(resolved);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
  `);
  ensureIncidentSchema(db);
  return db;
}

export function ensureIncidentSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 4),
      service TEXT NOT NULL,
      summary TEXT NOT NULL,
      symptoms TEXT NOT NULL,
      logs_ref TEXT,
      signature TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'mitigated', 'closed'))
    );

    CREATE TABLE IF NOT EXISTS patches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      risk TEXT NOT NULL CHECK (risk IN ('LOW', 'MED', 'HIGH')),
      impact INTEGER NOT NULL CHECK (impact >= 1),
      rationale TEXT NOT NULL,
      diff_ref TEXT,
      score REAL,
      status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'applied', 'reverted')),
      FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patch_id INTEGER,
      type TEXT NOT NULL,
      uri TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (patch_id) REFERENCES patches (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      iteration INTEGER NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('ADVANCE', 'ROLLBACK', 'HOLD')),
      notes TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_signature ON incidents (service, signature, status);
    CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents (created_at);
    CREATE INDEX IF NOT EXISTS idx_patches_incident_id ON patches (incident_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_patch_id ON evidence (patch_id);
    CREATE INDEX IF NOT EXISTS idx_checkpoints_iteration ON checkpoints (iteration);
  `);
}

export function listOpenIncidents(db: DatabaseSync, limit = 100): IncidentRow[] {
  return db
    .prepare(
      `
        SELECT id, created_at, severity, service, summary, symptoms, logs_ref, signature, status
        FROM incidents
        WHERE status = 'open'
        ORDER BY created_at DESC
        LIMIT ?
      `,
    )
    .all(limit) as unknown as IncidentRow[];
}

export function insertPatchRecord(
  db: DatabaseSync,
  params: {
    incidentId: number;
    risk: PatchRow["risk"];
    impact: number;
    rationale: string;
    diffRef?: string;
    score?: number;
    status?: PatchRow["status"];
  },
): number {
  const result = db
    .prepare(
      `
        INSERT INTO patches (incident_id, risk, impact, rationale, diff_ref, score, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      params.incidentId,
      params.risk,
      params.impact,
      params.rationale,
      params.diffRef ?? null,
      params.score ?? null,
      params.status ?? "proposed",
    );
  return Number(result.lastInsertRowid);
}

export function insertCheckpoint(
  db: DatabaseSync,
  params: { iteration: number; decision: CheckpointDecision; notes: string },
): number {
  const result = db
    .prepare(
      `
        INSERT INTO checkpoints (iteration, decision, notes)
        VALUES (?, ?, ?)
      `,
    )
    .run(params.iteration, params.decision, params.notes);
  return Number(result.lastInsertRowid);
}
