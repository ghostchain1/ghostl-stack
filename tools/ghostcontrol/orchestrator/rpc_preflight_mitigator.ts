import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { openIncidentDb } from "../incidents/db.ts";

export const RPC_PREFLIGHT_INCIDENT_SERVICE = "event-cycle";
export const RPC_PREFLIGHT_INCIDENT_SUMMARY = "run_event_cycle rpc preflight degraded";

export interface RpcPreflightMitigatorOptions {
  dbPath: string;
  logPath: string;
  sourcePreflightLogPath?: string;
  trigger: "auto_remediation_recovered" | "manual";
}

export interface RpcPreflightMitigatorResult {
  status: "ok";
  dbPath: string;
  logPath: string;
  sourcePreflightLogPath?: string;
  trigger: RpcPreflightMitigatorOptions["trigger"];
  openBefore: number;
  mitigatedCount: number;
  mitigatedIncidentIds: number[];
  openAfter: number;
  generatedAtUtc: string;
}

export function parseRpcPreflightMitigatorArgs(argv: string[]): RpcPreflightMitigatorOptions {
  const parsed: RpcPreflightMitigatorOptions = {
    dbPath: process.env.GHOST_RPC_INCIDENT_DB_PATH ??
      "/home/ghost/ghostl-stack/tools/ghostcontrol/incidents/incidents.db",
    logPath: process.env.GHOST_RPC_PREFLIGHT_MITIGATION_LOG_PATH ??
      "/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/logs/rpc-preflight-mitigation.json",
    sourcePreflightLogPath: process.env.GHOST_RPC_PREFLIGHT_SOURCE_LOG_PATH,
    trigger: "auto_remediation_recovered",
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
    if (token === "--source-log-path" && argv[i + 1]) {
      parsed.sourcePreflightLogPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--trigger" && argv[i + 1]) {
      const candidate = argv[i + 1];
      if (candidate === "auto_remediation_recovered" || candidate === "manual") {
        parsed.trigger = candidate;
      }
      i += 1;
      continue;
    }
  }

  if (!parsed.dbPath.trim()) {
    throw new Error("invalid_db_path");
  }
  if (!parsed.logPath.trim()) {
    throw new Error("invalid_log_path");
  }

  return parsed;
}

function listOpenRpcPreflightIncidentIds(db: ReturnType<typeof openIncidentDb>): number[] {
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
      RPC_PREFLIGHT_INCIDENT_SERVICE,
      RPC_PREFLIGHT_INCIDENT_SUMMARY,
    ) as Array<{ id: number }>;

  return rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
}

export async function mitigateRpcPreflightIncidents(
  options: RpcPreflightMitigatorOptions,
): Promise<RpcPreflightMitigatorResult> {
  const db = openIncidentDb(options.dbPath);

  try {
    const openIds = listOpenRpcPreflightIncidentIds(db);
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
          RPC_PREFLIGHT_INCIDENT_SERVICE,
          RPC_PREFLIGHT_INCIDENT_SUMMARY,
        );
      mitigatedCount = Number(update.changes ?? 0);
    }

    const openAfter = listOpenRpcPreflightIncidentIds(db).length;

    const result: RpcPreflightMitigatorResult = {
      status: "ok",
      dbPath: options.dbPath,
      logPath: options.logPath,
      sourcePreflightLogPath: options.sourcePreflightLogPath,
      trigger: options.trigger,
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
  const options = parseRpcPreflightMitigatorArgs(process.argv.slice(2));
  const result = await mitigateRpcPreflightIncidents(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  cliMain().catch((error) => {
    process.stderr.write(`[rpc-preflight-mitigator] failed ${String(error)}\n`);
    process.exit(1);
  });
}
