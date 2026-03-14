import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { collectIncidents, type IncidentSignal } from "../incidents/collector.ts";
import { runShellCommand, type ShellCommandResult } from "../deploy/docker_access.ts";
import { evaluateWatchdogHealth, type WatchdogHealthResult } from "./watchdog_healthcheck.ts";

const DEFAULT_STATUS_PATH =
  "/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/logs/event-watchdog.status.json";
const DEFAULT_ARTIFACT_DIR =
  "/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/logs";
const DEFAULT_INCIDENT_DB_PATH =
  "/home/ghost/ghostl-stack/tools/ghostcontrol/incidents/incidents.db";
const DEFAULT_MAX_STALE_SECONDS = 120;
const DEFAULT_RECHECK_DELAY_MS = 2_000;
const DEFAULT_SERVICE_NAME = "ghostcontrol-event-watchdog.service";

export interface WatchdogRecoveryOptions {
  statusPath: string;
  maxStaleSeconds: number;
  serviceName: string;
  artifactDir: string;
  incidentDbPath: string;
  recheckDelayMs: number;
  skipRestart: boolean;
}

export interface WatchdogRecoveryResult {
  ok: boolean;
  reason: "already_healthy" | "recovered" | "unrecovered";
  action: "none" | "restart_attempted" | "restart_skipped";
  serviceName: string;
  statusPath: string;
  before: WatchdogHealthResult;
  after: WatchdogHealthResult;
  restart: {
    ok: boolean;
    command: string;
    exitCode: number | null;
    output: string;
  } | null;
  recoveryArtifactPath: string | null;
  incident: {
    inserted: number;
    deduped: number;
    touchedIncidentIds: number[];
  } | null;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function timestampSlug(input: Date): string {
  return input.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toRestartSnapshot(result: ShellCommandResult): WatchdogRecoveryResult["restart"] {
  return {
    ok: result.ok,
    command: result.command,
    exitCode: result.exitCode,
    output: result.output,
  };
}

function restartWatchdogService(serviceName: string): ShellCommandResult {
  const direct = runShellCommand(`systemctl restart ${shellQuote(serviceName)}`);
  const uid = typeof process.getuid === "function" ? process.getuid() : -1;
  if (direct.ok || uid === 0) {
    return direct;
  }
  return runShellCommand(`sudo -n systemctl restart ${shellQuote(serviceName)}`);
}

export function buildFailureIncidentSignal(params: {
  statusPath: string;
  maxStaleSeconds: number;
  serviceName: string;
  before: WatchdogHealthResult;
  after: WatchdogHealthResult;
  recoveryArtifactPath: string;
}): IncidentSignal {
  return {
    service: "event-watchdog",
    severity: "critical",
    summary: "watchdog healthcheck unrecovered after restart",
    symptoms: [
      `before_reason=${params.before.reason}`,
      `after_reason=${params.after.reason}`,
      `service_name=${params.serviceName}`,
      `status_path=${params.statusPath}`,
      `max_stale_seconds=${params.maxStaleSeconds}`,
    ],
    logsRef: params.recoveryArtifactPath,
  };
}

export function parseRecoveryArgs(argv: string[]): WatchdogRecoveryOptions {
  const parsed: WatchdogRecoveryOptions = {
    statusPath: process.env.GHOSTCONTROL_WATCHDOG_STATUS_PATH ?? DEFAULT_STATUS_PATH,
    maxStaleSeconds: Number(
      process.env.GHOSTCONTROL_WATCHDOG_MAX_STALE_SECONDS ?? DEFAULT_MAX_STALE_SECONDS,
    ),
    serviceName: process.env.GHOSTCONTROL_WATCHDOG_SERVICE_NAME ?? DEFAULT_SERVICE_NAME,
    artifactDir: process.env.GHOSTCONTROL_WATCHDOG_RECOVERY_ARTIFACT_DIR ?? DEFAULT_ARTIFACT_DIR,
    incidentDbPath: process.env.GHOSTCONTROL_INCIDENT_DB_PATH ?? DEFAULT_INCIDENT_DB_PATH,
    recheckDelayMs: Number(
      process.env.GHOSTCONTROL_WATCHDOG_RECOVERY_RECHECK_DELAY_MS ?? DEFAULT_RECHECK_DELAY_MS,
    ),
    skipRestart: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--status-path" && argv[i + 1]) {
      parsed.statusPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--max-stale-seconds" && argv[i + 1]) {
      parsed.maxStaleSeconds = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--service-name" && argv[i + 1]) {
      parsed.serviceName = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--artifact-dir" && argv[i + 1]) {
      parsed.artifactDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--incident-db-path" && argv[i + 1]) {
      parsed.incidentDbPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--recheck-delay-ms" && argv[i + 1]) {
      parsed.recheckDelayMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--skip-restart") {
      parsed.skipRestart = true;
    }
  }

  if (!Number.isFinite(parsed.maxStaleSeconds) || parsed.maxStaleSeconds <= 0) {
    throw new Error(`invalid_max_stale_seconds:${parsed.maxStaleSeconds}`);
  }
  if (!Number.isFinite(parsed.recheckDelayMs) || parsed.recheckDelayMs < 0) {
    throw new Error(`invalid_recheck_delay_ms:${parsed.recheckDelayMs}`);
  }
  if (!parsed.serviceName.trim()) {
    throw new Error("invalid_service_name");
  }

  return parsed;
}

export async function runWatchdogRecovery(
  options: WatchdogRecoveryOptions,
): Promise<WatchdogRecoveryResult> {
  const before = await evaluateWatchdogHealth({
    statusPath: options.statusPath,
    maxStaleSeconds: options.maxStaleSeconds,
  });
  if (before.ok) {
    return {
      ok: true,
      reason: "already_healthy",
      action: "none",
      serviceName: options.serviceName,
      statusPath: options.statusPath,
      before,
      after: before,
      restart: null,
      recoveryArtifactPath: null,
      incident: null,
    };
  }

  let restart: WatchdogRecoveryResult["restart"] = null;
  let action: WatchdogRecoveryResult["action"] = "restart_skipped";
  if (!options.skipRestart) {
    action = "restart_attempted";
    const restartResult = restartWatchdogService(options.serviceName);
    restart = toRestartSnapshot(restartResult);
  }

  if (options.recheckDelayMs > 0) {
    await sleep(options.recheckDelayMs);
  }

  const after = await evaluateWatchdogHealth({
    statusPath: options.statusPath,
    maxStaleSeconds: options.maxStaleSeconds,
  });

  await mkdir(options.artifactDir, { recursive: true });
  const recoveryArtifactPath = path.join(
    options.artifactDir,
    `event-watchdog-recovery-${timestampSlug(new Date())}.json`,
  );
  await writeFile(
    recoveryArtifactPath,
    `${JSON.stringify(
      {
        action,
        statusPath: options.statusPath,
        maxStaleSeconds: options.maxStaleSeconds,
        serviceName: options.serviceName,
        before,
        restart,
        after,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  let incident: WatchdogRecoveryResult["incident"] = null;
  if (!after.ok) {
    incident = collectIncidents({
      dbPath: options.incidentDbPath,
      signals: [
        buildFailureIncidentSignal({
          statusPath: options.statusPath,
          maxStaleSeconds: options.maxStaleSeconds,
          serviceName: options.serviceName,
          before,
          after,
          recoveryArtifactPath,
        }),
      ],
    });
  }

  return {
    ok: after.ok,
    reason: after.ok ? "recovered" : "unrecovered",
    action,
    serviceName: options.serviceName,
    statusPath: options.statusPath,
    before,
    after,
    restart,
    recoveryArtifactPath,
    incident,
  };
}

async function cliMain() {
  const options = parseRecoveryArgs(process.argv.slice(2));
  const result = await runWatchdogRecovery(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  cliMain().catch((error) => {
    process.stderr.write(`[watchdog-recovery] failed ${String(error)}\n`);
    process.exit(1);
  });
}
