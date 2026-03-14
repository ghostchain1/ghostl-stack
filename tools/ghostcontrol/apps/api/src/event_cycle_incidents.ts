import { constants } from "node:fs";
import { access, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export const LOCK_CONTENTION_SUMMARY = "run_event_cycle lock contention timeout";
export const RPC_PREFLIGHT_SUMMARY = "run_event_cycle rpc preflight degraded";
export const DISK_PRESSURE_SUMMARY = "run_event_cycle host disk pressure";

const TRACKED_SUMMARIES = [
  LOCK_CONTENTION_SUMMARY,
  RPC_PREFLIGHT_SUMMARY,
  DISK_PRESSURE_SUMMARY,
] as const;

export type EventCycleIncidentStatus = "open" | "mitigated" | "closed";

export interface EventCycleIncidentCounts {
  open: number;
  mitigated: number;
  closed: number;
  total: number;
}

export interface EventCycleIncidentBucket extends EventCycleIncidentCounts {
  latestStatus: EventCycleIncidentStatus | null;
  latestCreatedAtUtc: string | null;
}

export interface EventCycleIncidentRow {
  id: number;
  createdAtUtc: string;
  severity: number;
  severityLabel: "info" | "warn" | "error" | "critical";
  service: string;
  summary: string;
  symptoms: string;
  logsRef: string | null;
  signature: string;
  status: EventCycleIncidentStatus;
}

export interface EventCycleIncidentSummary {
  dbPath: string;
  available: boolean;
  alert: {
    openIncidentThreshold: number;
    openIncidentCount: number;
    state: "ok" | "warning";
  };
  trackedSummaries: {
    lockContention: string;
    rpcPreflight: string;
    diskPressure: string;
  };
  totals: EventCycleIncidentCounts;
  lockContention: EventCycleIncidentBucket;
  rpcPreflight: EventCycleIncidentBucket;
  diskPressure: EventCycleIncidentBucket;
  recent: EventCycleIncidentRow[];
}

function emptyCounts(): EventCycleIncidentCounts {
  return {
    open: 0,
    mitigated: 0,
    closed: 0,
    total: 0,
  };
}

function emptyBucket(): EventCycleIncidentBucket {
  return {
    ...emptyCounts(),
    latestStatus: null,
    latestCreatedAtUtc: null,
  };
}

function sanitizeOpenWarnThreshold(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.trunc(parsed);
}

function toAlert(openIncidentCount: number, openIncidentThreshold: number): EventCycleIncidentSummary["alert"] {
  return {
    openIncidentThreshold,
    openIncidentCount,
    state: openIncidentCount >= openIncidentThreshold ? "warning" : "ok",
  };
}

function emptySummary(dbPath: string, openWarnThreshold: number): EventCycleIncidentSummary {
  return {
    dbPath,
    available: false,
    alert: toAlert(0, openWarnThreshold),
    trackedSummaries: {
      lockContention: LOCK_CONTENTION_SUMMARY,
      rpcPreflight: RPC_PREFLIGHT_SUMMARY,
      diskPressure: DISK_PRESSURE_SUMMARY,
    },
    totals: emptyCounts(),
    lockContention: emptyBucket(),
    rpcPreflight: emptyBucket(),
    diskPressure: emptyBucket(),
    recent: [],
  };
}

function toNonNegativeInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

function toIncidentStatus(value: unknown): EventCycleIncidentStatus | null {
  if (value === "open" || value === "mitigated" || value === "closed") {
    return value;
  }
  return null;
}

function severityLabel(value: number): EventCycleIncidentRow["severityLabel"] {
  if (value >= 4) return "critical";
  if (value >= 3) return "error";
  if (value >= 2) return "warn";
  return "info";
}

function readCounts(
  db: DatabaseSync,
  whereClause: string,
  params: ReadonlyArray<SQLInputValue>,
): EventCycleIncidentCounts {
  const rows = db
    .prepare(
      `
      SELECT status, COUNT(*) AS c
      FROM incidents
      ${whereClause}
      GROUP BY status
      `,
    )
    .all(...params) as Array<{ status: string; c: number }>;

  const counts = emptyCounts();
  for (const row of rows) {
    const status = toIncidentStatus(row.status);
    if (!status) continue;
    const value = toNonNegativeInt(row.c);
    counts[status] = value;
  }
  counts.total = counts.open + counts.mitigated + counts.closed;
  return counts;
}

function readBucket(db: DatabaseSync, summary: string): EventCycleIncidentBucket {
  const counts = readCounts(db, "WHERE summary = ?", [summary]);
  const latest = db
    .prepare(
      `
      SELECT created_at, status
      FROM incidents
      WHERE summary = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      `,
    )
    .get(summary) as { created_at?: string; status?: string } | undefined;

  const latestStatus = toIncidentStatus(latest?.status);
  return {
    ...counts,
    latestStatus,
    latestCreatedAtUtc: typeof latest?.created_at === "string" ? latest.created_at : null,
  };
}

async function isReadableFile(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function copyIfReadable(source: string, destination: string): Promise<void> {
  if (!(await isReadableFile(source))) return;
  await copyFile(source, destination);
}

async function createIncidentDbSnapshot(dbPath: string): Promise<{
  snapshotDbPath: string;
  cleanup: () => Promise<void>;
}> {
  const snapshotDir = await mkdtemp(path.join(tmpdir(), "ghostcontrol-event-cycle-incidents-"));
  const snapshotDbPath = path.join(snapshotDir, "incidents.db");
  await copyFile(dbPath, snapshotDbPath);
  await copyIfReadable(`${dbPath}-wal`, `${snapshotDbPath}-wal`);
  await copyIfReadable(`${dbPath}-shm`, `${snapshotDbPath}-shm`);
  return {
    snapshotDbPath,
    cleanup: async () => {
      await rm(snapshotDir, { recursive: true, force: true });
    },
  };
}

export async function readEventCycleIncidentSummary(params: {
  dbPath: string;
  limit?: number;
  openWarnThreshold?: number;
}): Promise<EventCycleIncidentSummary> {
  const dbPath = params.dbPath;
  const limit = Math.max(1, Math.min(200, params.limit ?? 40));
  const openWarnThreshold = sanitizeOpenWarnThreshold(params.openWarnThreshold);
  const fallback = emptySummary(dbPath, openWarnThreshold);

  if (!(await isReadableFile(dbPath))) {
    return fallback;
  }

  const summaryPlaceholders = TRACKED_SUMMARIES.map(() => "?").join(", ");
  const summaryFilter = `WHERE summary IN (${summaryPlaceholders})`;

  let db: DatabaseSync | null = null;
  let snapshotCleanup: (() => Promise<void>) | null = null;
  try {
    const snapshot = await createIncidentDbSnapshot(dbPath);
    snapshotCleanup = snapshot.cleanup;
    db = new DatabaseSync(snapshot.snapshotDbPath, { readOnly: true });

    const totals = readCounts(db, summaryFilter, TRACKED_SUMMARIES);
    const lockContention = readBucket(db, LOCK_CONTENTION_SUMMARY);
    const rpcPreflight = readBucket(db, RPC_PREFLIGHT_SUMMARY);
    const diskPressure = readBucket(db, DISK_PRESSURE_SUMMARY);

    const recentRows = db
      .prepare(
        `
        SELECT id, created_at, severity, service, summary, symptoms, logs_ref, signature, status
        FROM incidents
        ${summaryFilter}
        ORDER BY created_at DESC, id DESC
        LIMIT ?
        `,
      )
      .all(...TRACKED_SUMMARIES, limit) as Array<{
      id: number;
      created_at: string;
      severity: number;
      service: string;
      summary: string;
      symptoms: string;
      logs_ref: string | null;
      signature: string;
      status: string;
    }>;

    const recent: EventCycleIncidentRow[] = recentRows
      .map((row) => {
        const status = toIncidentStatus(row.status);
        if (!status) return null;
        const severity = toNonNegativeInt(row.severity);
        return {
          id: toNonNegativeInt(row.id),
          createdAtUtc: typeof row.created_at === "string" ? row.created_at : "",
          severity,
          severityLabel: severityLabel(severity),
          service: typeof row.service === "string" ? row.service : "unknown",
          summary: typeof row.summary === "string" ? row.summary : "unknown",
          symptoms: typeof row.symptoms === "string" ? row.symptoms : "",
          logsRef: typeof row.logs_ref === "string" ? row.logs_ref : null,
          signature: typeof row.signature === "string" ? row.signature : "",
          status,
        } satisfies EventCycleIncidentRow;
      })
      .filter((row): row is EventCycleIncidentRow => row != null);

    return {
      ...fallback,
      available: true,
      alert: toAlert(totals.open, openWarnThreshold),
      totals,
      lockContention,
      rpcPreflight,
      diskPressure,
      recent,
    };
  } catch {
    return fallback;
  } finally {
    db?.close();
    if (snapshotCleanup) {
      await snapshotCleanup();
    }
  }
}
