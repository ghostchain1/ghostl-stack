import { createHash } from "node:crypto";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runShellCommand } from "../deploy/docker_access.ts";

const ROOT_DIR = "/home/ghost/ghostl-stack";
const DEFAULT_EVENT_RUNNER =
  "/home/ghost/ghostl-stack/tools/ghostcontrol/orchestrator/run_event_cycle.sh";
const DEFAULT_PROMETHEUS_URL = "http://localhost:9090";
const DEFAULT_POLL_INTERVAL_MS = 20_000;
const DEFAULT_COOLDOWN_MS = 45_000;
const DEFAULT_STATUS_PATH =
  "/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/logs/event-watchdog.status.json";
const DEFAULT_HEARTBEAT_LOG_INTERVAL_MS = 60_000;

const DEFAULT_WATCH_FILES = [
  "tools/ghostcontrol/infra/compose/docker-compose.yml",
  "tools/ghostcontrol/apps/policy/config/action-scopes.json",
  "tools/ghostcontrol/apps/policy/config/risk-allowlist.json",
  "tools/ghostcontrol/guards/config/network-rules.json",
];

export interface FileFingerprintEntry {
  path: string;
  exists: boolean;
  size: number;
  mtimeMs: number;
}

export interface WatchdogOptions {
  pollIntervalMs: number;
  cooldownMs: number;
  prometheusUrl: string;
  watchFiles: string[];
  eventRunnerPath: string;
  statusPath: string;
  heartbeatLogIntervalMs: number;
  once: boolean;
}

export interface WatchdogRuntimeStatus {
  schemaVersion: 1;
  startedAt: string;
  startedUnixMs: number;
  pid: number;
  pollIntervalMs: number;
  cooldownMs: number;
  heartbeatAt: string;
  heartbeatUnixMs: number;
  lastLoopAt: string;
  lastLoopUnixMs: number;
  lastCycleAt: string | null;
  lastCycleUnixMs: number | null;
  lastCycleIteration: number | null;
  lastCycleOk: boolean | null;
  lastCycleReason: string | null;
  cycleRunning: boolean;
  pendingReason: string | null;
  healthy: boolean;
  watchFiles: string[];
  prometheusUrl: string;
  eventRunnerPath: string;
}

function isoNow(): string {
  return new Date().toISOString();
}

function logLine(message: string): void {
  process.stdout.write(`[event-watchdog] ${isoNow()} ${message}\n`);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeWatchFiles(input: string[]): string[] {
  const resolved = input.map((item) => (
    path.isAbsolute(item) ? item : path.join(ROOT_DIR, item)
  ));
  return [...new Set(resolved)].sort();
}

export function buildFileFingerprintDigest(entries: FileFingerprintEntry[]): string {
  const canonical = [...entries]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((entry) => (
      `${entry.path}|exists=${entry.exists ? "1" : "0"}|size=${entry.size}|mtime=${Math.trunc(entry.mtimeMs)}`
    ))
    .join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function extractIterationFromEventCycleOutput(output: string): number | null {
  const match = output.match(/event_cycle_complete iteration=([0-9]+)/);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function snapshotWatchFiles(paths: string[]): Promise<{
  digest: string;
  entries: FileFingerprintEntry[];
}> {
  const entries: FileFingerprintEntry[] = [];
  for (const watchPath of paths) {
    try {
      const meta = await stat(watchPath);
      entries.push({
        path: watchPath,
        exists: true,
        size: meta.size,
        mtimeMs: meta.mtimeMs,
      });
    } catch {
      entries.push({
        path: watchPath,
        exists: false,
        size: 0,
        mtimeMs: 0,
      });
    }
  }
  return {
    digest: buildFileFingerprintDigest(entries),
    entries,
  };
}

function snapshotGitState(): {
  head: string;
  dirtyHash: string;
} {
  const headProbe = runShellCommand(`git -C ${shellQuote(ROOT_DIR)} rev-parse HEAD`);
  const dirtyProbe = runShellCommand(
    [
      `git -C ${shellQuote(ROOT_DIR)} status --short --untracked-files=no --`,
      "tools/ghostcontrol/infra/compose",
      "tools/ghostcontrol/apps/policy/config",
      "tools/ghostcontrol/guards/config",
    ].join(" "),
  );
  const head = headProbe.ok ? headProbe.output.trim() : "unknown";
  const dirtyHash = createHash("sha256").update(dirtyProbe.output ?? "", "utf8").digest("hex");
  return { head, dirtyHash };
}

function sanitizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
}

function sortRecord(value: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(value).sort().map((key) => [key, value[key]]));
}

export function extractFiringAlertFingerprints(payload: unknown): string[] {
  const alerts = (payload as any)?.data?.alerts;
  if (!Array.isArray(alerts)) return [];
  const firing = alerts
    .filter((alert) => String(alert?.state ?? "").toLowerCase() === "firing")
    .map((alert) => {
      const labels = alert?.labels && typeof alert.labels === "object"
        ? (alert.labels as Record<string, unknown>)
        : {};
      return createHash("sha256").update(sortRecord(labels), "utf8").digest("hex");
    });
  return [...new Set(firing)].sort();
}

async function fetchFiringAlerts(prometheusUrl: string): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${prometheusUrl.replace(/\/+$/, "")}/api/v1/alerts`, {
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = await res.json();
    return extractFiringAlertFingerprints(json);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs(argv: string[]): WatchdogOptions {
  const defaults = normalizeWatchFiles([
    ...DEFAULT_WATCH_FILES,
    ...parseCsv(process.env.GHOSTCONTROL_WATCH_FILES),
  ]);
  const parsed: WatchdogOptions = {
    pollIntervalMs: Number(process.env.GHOSTCONTROL_WATCH_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS),
    cooldownMs: Number(process.env.GHOSTCONTROL_WATCH_COOLDOWN_MS ?? DEFAULT_COOLDOWN_MS),
    prometheusUrl: process.env.GHOSTCONTROL_PROMETHEUS_URL ?? DEFAULT_PROMETHEUS_URL,
    watchFiles: defaults,
    eventRunnerPath: process.env.GHOSTCONTROL_EVENT_RUNNER_PATH ?? DEFAULT_EVENT_RUNNER,
    statusPath: process.env.GHOSTCONTROL_WATCHDOG_STATUS_PATH ?? DEFAULT_STATUS_PATH,
    heartbeatLogIntervalMs: Number(
      process.env.GHOSTCONTROL_WATCH_HEARTBEAT_LOG_INTERVAL_MS ?? DEFAULT_HEARTBEAT_LOG_INTERVAL_MS,
    ),
    once: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--interval-ms" && argv[i + 1]) {
      parsed.pollIntervalMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--cooldown-ms" && argv[i + 1]) {
      parsed.cooldownMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--prometheus-url" && argv[i + 1]) {
      parsed.prometheusUrl = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--watch-file" && argv[i + 1]) {
      parsed.watchFiles = normalizeWatchFiles([...parsed.watchFiles, argv[i + 1]]);
      i += 1;
      continue;
    }
    if (token === "--event-runner" && argv[i + 1]) {
      parsed.eventRunnerPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--status-path" && argv[i + 1]) {
      parsed.statusPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--heartbeat-log-interval-ms" && argv[i + 1]) {
      parsed.heartbeatLogIntervalMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--once") {
      parsed.once = true;
    }
  }

  if (!Number.isFinite(parsed.pollIntervalMs) || parsed.pollIntervalMs < 1_000) {
    throw new Error(`invalid_poll_interval_ms:${parsed.pollIntervalMs}`);
  }
  if (!Number.isFinite(parsed.cooldownMs) || parsed.cooldownMs < 0) {
    throw new Error(`invalid_cooldown_ms:${parsed.cooldownMs}`);
  }
  if (!Number.isFinite(parsed.heartbeatLogIntervalMs) || parsed.heartbeatLogIntervalMs < 1_000) {
    throw new Error(`invalid_heartbeat_log_interval_ms:${parsed.heartbeatLogIntervalMs}`);
  }
  return parsed;
}

async function writeStatusFile(statusPath: string, status: WatchdogRuntimeStatus): Promise<void> {
  await mkdir(path.dirname(statusPath), { recursive: true });
  const tempPath = `${statusPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  await rename(tempPath, statusPath);
}

async function runEventCycle(eventRunnerPath: string, eventReason: string): Promise<{
  ok: boolean;
  iteration: number | null;
}> {
  const command = `bash ${shellQuote(eventRunnerPath)} ${shellQuote(eventReason)}`;
  const result = runShellCommand(command);
  const iteration = extractIterationFromEventCycleOutput(result.output ?? "");
  if (!result.ok) {
    logLine(`event_cycle_failed reason=${eventReason} output=${JSON.stringify(result.output)}`);
    return { ok: false, iteration };
  }
  logLine(`event_cycle_ok reason=${eventReason} iteration=${iteration ?? "unknown"}`);
  return { ok: true, iteration };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWatchdog(options: WatchdogOptions): Promise<void> {
  const baselineFiles = await snapshotWatchFiles(options.watchFiles);
  let fileDigest = baselineFiles.digest;
  let gitState = snapshotGitState();
  let alertFingerprints = new Set(await fetchFiringAlerts(options.prometheusUrl));
  let cycleRunning = false;
  let pendingReason: string | null = null;
  let lastCycleAtMs = 0;
  let lastHeartbeatLogAtMs = 0;
  const startedUnixMs = Date.now();

  const status: WatchdogRuntimeStatus = {
    schemaVersion: 1,
    startedAt: isoNow(),
    startedUnixMs,
    pid: process.pid,
    pollIntervalMs: options.pollIntervalMs,
    cooldownMs: options.cooldownMs,
    heartbeatAt: isoNow(),
    heartbeatUnixMs: startedUnixMs,
    lastLoopAt: isoNow(),
    lastLoopUnixMs: startedUnixMs,
    lastCycleAt: null,
    lastCycleUnixMs: null,
    lastCycleIteration: null,
    lastCycleOk: null,
    lastCycleReason: null,
    cycleRunning: false,
    pendingReason: null,
    healthy: true,
    watchFiles: options.watchFiles,
    prometheusUrl: options.prometheusUrl,
    eventRunnerPath: options.eventRunnerPath,
  };

  const updateStatus = async (patch: Partial<WatchdogRuntimeStatus>): Promise<void> => {
    Object.assign(status, patch);
    status.heartbeatAt = isoNow();
    status.heartbeatUnixMs = Date.now();
    await writeStatusFile(options.statusPath, status);
  };

  const trigger = async (reason: string) => {
    const elapsed = Date.now() - lastCycleAtMs;
    if (cycleRunning) {
      pendingReason = pendingReason ?? reason;
      logLine(`event_queued reason=${reason}`);
      await updateStatus({ cycleRunning: true, pendingReason });
      return;
    }
    if (elapsed < options.cooldownMs) {
      pendingReason = pendingReason ?? reason;
      logLine(`event_deferred reason=${reason} cooldown_ms_remaining=${options.cooldownMs - elapsed}`);
      await updateStatus({ cycleRunning: false, pendingReason });
      return;
    }

    cycleRunning = true;
    lastCycleAtMs = Date.now();
    await updateStatus({
      cycleRunning: true,
      pendingReason,
      lastCycleReason: reason,
    });

    const cycleResult = await runEventCycle(options.eventRunnerPath, reason);

    cycleRunning = false;
    await updateStatus({
      cycleRunning: false,
      pendingReason,
      lastCycleReason: reason,
      lastCycleAt: isoNow(),
      lastCycleUnixMs: Date.now(),
      lastCycleIteration: cycleResult.iteration ?? status.lastCycleIteration,
      lastCycleOk: cycleResult.ok,
      healthy: true,
    });

    if (pendingReason) {
      const nextReason = pendingReason;
      pendingReason = null;
      await updateStatus({ cycleRunning: false, pendingReason });
      await trigger(nextReason);
    }
  };

  logLine(
    `started poll_interval_ms=${options.pollIntervalMs} cooldown_ms=${options.cooldownMs} watch_files=${options.watchFiles.length}`,
  );
  await updateStatus({ cycleRunning: false, pendingReason: null, healthy: true });

  while (true) {
    let triggered = false;

    const nextFiles = await snapshotWatchFiles(options.watchFiles);
    if (nextFiles.digest !== fileDigest) {
      fileDigest = nextFiles.digest;
      triggered = true;
      await trigger("compose_config_change");
    }

    const nextGit = snapshotGitState();
    if (nextGit.head !== gitState.head || nextGit.dirtyHash !== gitState.dirtyHash) {
      gitState = nextGit;
      triggered = true;
      await trigger("git_workspace_change");
    }

    const nextAlerts = await fetchFiringAlerts(options.prometheusUrl);
    const newAlerts = nextAlerts.filter((fingerprint) => !alertFingerprints.has(fingerprint));
    alertFingerprints = new Set(nextAlerts);
    if (newAlerts.length > 0) {
      triggered = true;
      await trigger(`prometheus_alert_${sanitizeToken(newAlerts[0] ?? "firing")}`);
    }

    await updateStatus({
      cycleRunning,
      pendingReason,
      healthy: true,
      lastLoopAt: isoNow(),
      lastLoopUnixMs: Date.now(),
    });

    if (Date.now() - lastHeartbeatLogAtMs >= options.heartbeatLogIntervalMs) {
      lastHeartbeatLogAtMs = Date.now();
      const cycleAgeMs = status.lastCycleUnixMs == null
        ? -1
        : Date.now() - status.lastCycleUnixMs;
      logLine(
        `heartbeat cycle_running=${String(cycleRunning)} pending_reason=${pendingReason ?? "none"} last_cycle_ok=${String(status.lastCycleOk)} last_cycle_iteration=${status.lastCycleIteration ?? "none"} cycle_age_ms=${cycleAgeMs}`,
      );
    }

    if (options.once) return;
    if (!triggered) await sleep(options.pollIntervalMs);
  }
}

async function cliMain() {
  const options = parseArgs(process.argv.slice(2));
  await runWatchdog(options);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  cliMain().catch((error) => {
    process.stderr.write(`[event-watchdog] failed ${String(error)}\n`);
    process.exit(1);
  });
}
