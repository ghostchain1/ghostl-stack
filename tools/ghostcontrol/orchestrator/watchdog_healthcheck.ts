import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_STATUS_PATH =
  "/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/logs/event-watchdog.status.json";
const DEFAULT_MAX_STALE_SECONDS = 120;

export interface WatchdogHealthOptions {
  statusPath: string;
  maxStaleSeconds: number;
}

export interface WatchdogHealthResult {
  ok: boolean;
  reason: string;
  statusPath: string;
  nowUnixMs: number;
  heartbeatUnixMs: number | null;
  heartbeatAgeMs: number | null;
  maxStaleMs: number;
  pid: number | null;
  pidAlive: boolean;
  cmdlineContainsWatchdog: boolean;
}

export function parseHeartbeatUnixMs(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const status = raw as Record<string, unknown>;

  const fromNumber = status.heartbeatUnixMs;
  if (typeof fromNumber === "number" && Number.isFinite(fromNumber) && fromNumber > 0) {
    return fromNumber;
  }

  const fromIso = status.heartbeatAt;
  if (typeof fromIso === "string") {
    const parsed = Date.parse(fromIso);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return null;
}

export function isHeartbeatStale(params: {
  heartbeatUnixMs: number;
  nowUnixMs: number;
  maxStaleMs: number;
}): boolean {
  return params.nowUnixMs - params.heartbeatUnixMs > params.maxStaleMs;
}

function parseArgs(argv: string[]): WatchdogHealthOptions {
  const parsed: WatchdogHealthOptions = {
    statusPath: process.env.GHOSTCONTROL_WATCHDOG_STATUS_PATH ?? DEFAULT_STATUS_PATH,
    maxStaleSeconds: Number(
      process.env.GHOSTCONTROL_WATCHDOG_MAX_STALE_SECONDS ?? DEFAULT_MAX_STALE_SECONDS,
    ),
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
  }

  if (!Number.isFinite(parsed.maxStaleSeconds) || parsed.maxStaleSeconds <= 0) {
    throw new Error(`invalid_max_stale_seconds:${parsed.maxStaleSeconds}`);
  }

  return parsed;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function commandLineContainsWatchdog(pid: number): Promise<boolean> {
  try {
    const cmdline = await readFile(`/proc/${pid}/cmdline`, "utf8");
    return cmdline.includes("orchestrator/event_watchdog.ts");
  } catch {
    return false;
  }
}

export async function evaluateWatchdogHealth(
  options: WatchdogHealthOptions,
): Promise<WatchdogHealthResult> {
  const nowUnixMs = Date.now();
  const maxStaleMs = Math.round(options.maxStaleSeconds * 1_000);

  let parsedStatus: unknown = null;
  try {
    parsedStatus = JSON.parse(await readFile(options.statusPath, "utf8"));
  } catch {
    return {
      ok: false,
      reason: "status_unreadable",
      statusPath: options.statusPath,
      nowUnixMs,
      heartbeatUnixMs: null,
      heartbeatAgeMs: null,
      maxStaleMs,
      pid: null,
      pidAlive: false,
      cmdlineContainsWatchdog: false,
    };
  }

  const heartbeatUnixMs = parseHeartbeatUnixMs(parsedStatus);
  if (heartbeatUnixMs == null) {
    return {
      ok: false,
      reason: "missing_heartbeat",
      statusPath: options.statusPath,
      nowUnixMs,
      heartbeatUnixMs: null,
      heartbeatAgeMs: null,
      maxStaleMs,
      pid: null,
      pidAlive: false,
      cmdlineContainsWatchdog: false,
    };
  }

  const heartbeatAgeMs = nowUnixMs - heartbeatUnixMs;
  if (isHeartbeatStale({ heartbeatUnixMs, nowUnixMs, maxStaleMs })) {
    return {
      ok: false,
      reason: "heartbeat_stale",
      statusPath: options.statusPath,
      nowUnixMs,
      heartbeatUnixMs,
      heartbeatAgeMs,
      maxStaleMs,
      pid: null,
      pidAlive: false,
      cmdlineContainsWatchdog: false,
    };
  }

  const pid = Number((parsedStatus as any)?.pid ?? 0);
  if (!Number.isFinite(pid) || pid <= 0) {
    return {
      ok: false,
      reason: "invalid_pid",
      statusPath: options.statusPath,
      nowUnixMs,
      heartbeatUnixMs,
      heartbeatAgeMs,
      maxStaleMs,
      pid: null,
      pidAlive: false,
      cmdlineContainsWatchdog: false,
    };
  }

  const pidAlive = isPidAlive(pid);
  if (!pidAlive) {
    return {
      ok: false,
      reason: "process_not_running",
      statusPath: options.statusPath,
      nowUnixMs,
      heartbeatUnixMs,
      heartbeatAgeMs,
      maxStaleMs,
      pid,
      pidAlive,
      cmdlineContainsWatchdog: false,
    };
  }

  const cmdlineContainsWatchdog = await commandLineContainsWatchdog(pid);
  if (!cmdlineContainsWatchdog) {
    return {
      ok: false,
      reason: "process_cmdline_mismatch",
      statusPath: options.statusPath,
      nowUnixMs,
      heartbeatUnixMs,
      heartbeatAgeMs,
      maxStaleMs,
      pid,
      pidAlive,
      cmdlineContainsWatchdog,
    };
  }

  return {
    ok: true,
    reason: "ok",
    statusPath: options.statusPath,
    nowUnixMs,
    heartbeatUnixMs,
    heartbeatAgeMs,
    maxStaleMs,
    pid,
    pidAlive,
    cmdlineContainsWatchdog,
  };
}

async function cliMain() {
  const options = parseArgs(process.argv.slice(2));
  const result = await evaluateWatchdogHealth(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  cliMain().catch((error) => {
    process.stderr.write(`[watchdog-healthcheck] failed ${String(error)}\n`);
    process.exit(1);
  });
}
