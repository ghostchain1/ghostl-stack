import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { openIncidentDb } from "../incidents/db.ts";

export const LOCK_CONTENTION_INCIDENT_SERVICE = "event-cycle";
export const LOCK_CONTENTION_INCIDENT_SUMMARY = "run_event_cycle lock contention timeout";

export interface LockContentionMitigatorOptions {
  dbPath: string;
  logPath: string;
  iteration: number;
}

export interface LockContentionMitigatorResult {
  status: "ok";
  iteration: number;
  dbPath: string;
  logPath: string;
  openBefore: number;
  mitigatedCount: number;
  mitigatedIncidentIds: number[];
  openAfter: number;
  generatedAtUtc: string;
}

export function parseLockMitigatorArgs(argv: string[]): LockContentionMitigatorOptions {
  const parsed: LockContentionMitigatorOptions = {
    dbPath: process.env.GHOST_LOCK_INCIDENT_DB_PATH ??
      "/home/ghost/ghostl-stack/tools/ghostcontrol/incidents/incidents.db",
    logPath: process.env.GHOST_LOCK_MITIGATION_LOG_PATH ??
      "/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/logs/lock-contention-mitigation.json",
    iteration: Number(process.env.GHOST_ITERATION ?? "0"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--db-path" && argv[i + 1]) {
      parsed.dbPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--log-path" && argv[i + 1]) {
      parsed.logPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--iteration" && argv[i + 1]) {
      parsed.iteration = Number(argv[i + 1]);
      i += 1;
      continue;
    }
  }

  if (!Number.isFinite(parsed.iteration) || parsed.iteration <= 0) {
    throw new Error(`invalid_iteration:${parsed.iteration}`);
  }
  if (!parsed.dbPath.trim()) {
    throw new Error("invalid_db_path");
  }
  if (!parsed.logPath.trim()) {
    throw new Error("invalid_log_path");
  }

  return parsed;
}

function listOpenLockContentionIncidentIds(db: ReturnType<typeof openIncidentDb>): number[] {
  const rows = db
    .prepare(
      `
        SELECT id
        FROM incidents
        WHERE service = ?
          AND summary = ?
          AND status = 'open'
        ORDER BY id ASC
      `,
    )
    .all(
      LOCK_CONTENTION_INCIDENT_SERVICE,
      LOCK_CONTENTION_INCIDENT_SUMMARY,
    ) as Array<{ id: number }>;
  return rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
}

export async function mitigateLockContentionIncidents(
  options: LockContentionMitigatorOptions,
): Promise<LockContentionMitigatorResult> {
  const db = openIncidentDb(options.dbPath);
  try {
    const openIds = listOpenLockContentionIncidentIds(db);
    const openBefore = openIds.length;

    let mitigatedCount = 0;
    if (openBefore > 0) {
      const update = db
        .prepare(
          `
            UPDATE incidents
            SET status = 'mitigated'
            WHERE service = ?
              AND summary = ?
              AND status = 'open'
          `,
        )
        .run(
          LOCK_CONTENTION_INCIDENT_SERVICE,
          LOCK_CONTENTION_INCIDENT_SUMMARY,
        );
      mitigatedCount = Number(update.changes ?? 0);
    }

    const openAfter = listOpenLockContentionIncidentIds(db).length;
    const result: LockContentionMitigatorResult = {
      status: "ok",
      iteration: options.iteration,
      dbPath: options.dbPath,
      logPath: options.logPath,
      openBefore,
      mitigatedCount,
      mitigatedIncidentIds: openIds,
      openAfter,
      generatedAtUtc: new Date().toISOString(),
    };

    await mkdir(path.dirname(options.logPath), { recursive: true });
    await writeFile(options.logPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return result;
  } finally {
    db.close();
  }
}

async function cliMain() {
  const options = parseLockMitigatorArgs(process.argv.slice(2));
  const result = await mitigateLockContentionIncidents(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  cliMain().catch((error) => {
    process.stderr.write(`[lock-contention-mitigator] failed ${String(error)}\n`);
    process.exit(1);
  });
}
