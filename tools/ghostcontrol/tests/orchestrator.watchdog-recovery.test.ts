import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFailureIncidentSignal,
  parseRecoveryArgs,
} from "../orchestrator/watchdog_recovery.ts";

test("parseRecoveryArgs accepts CLI overrides and skip-restart flag", () => {
  const parsed = parseRecoveryArgs([
    "--status-path",
    "/tmp/watchdog.status.json",
    "--max-stale-seconds",
    "45",
    "--service-name",
    "custom-watchdog.service",
    "--artifact-dir",
    "/tmp/recovery",
    "--incident-db-path",
    "/tmp/incidents.db",
    "--recheck-delay-ms",
    "500",
    "--skip-restart",
  ]);

  assert.equal(parsed.statusPath, "/tmp/watchdog.status.json");
  assert.equal(parsed.maxStaleSeconds, 45);
  assert.equal(parsed.serviceName, "custom-watchdog.service");
  assert.equal(parsed.artifactDir, "/tmp/recovery");
  assert.equal(parsed.incidentDbPath, "/tmp/incidents.db");
  assert.equal(parsed.recheckDelayMs, 500);
  assert.equal(parsed.skipRestart, true);
});

test("parseRecoveryArgs rejects non-positive stale threshold", () => {
  assert.throws(
    () => parseRecoveryArgs(["--max-stale-seconds", "0"]),
    /invalid_max_stale_seconds/,
  );
});

test("buildFailureIncidentSignal encodes stable recovery failure fields", () => {
  const signal = buildFailureIncidentSignal({
    statusPath: "/tmp/watchdog.status.json",
    maxStaleSeconds: 120,
    serviceName: "ghostcontrol-event-watchdog.service",
    before: {
      ok: false,
      reason: "heartbeat_stale",
      statusPath: "/tmp/watchdog.status.json",
      nowUnixMs: 1_000,
      heartbeatUnixMs: 100,
      heartbeatAgeMs: 900,
      maxStaleMs: 120_000,
      pid: 42,
      pidAlive: true,
      cmdlineContainsWatchdog: true,
    },
    after: {
      ok: false,
      reason: "process_not_running",
      statusPath: "/tmp/watchdog.status.json",
      nowUnixMs: 2_000,
      heartbeatUnixMs: 100,
      heartbeatAgeMs: 1_900,
      maxStaleMs: 120_000,
      pid: 42,
      pidAlive: false,
      cmdlineContainsWatchdog: false,
    },
    recoveryArtifactPath: "/tmp/event-watchdog-recovery.json",
  });

  assert.equal(signal.service, "event-watchdog");
  assert.equal(signal.severity, "critical");
  assert.equal(signal.summary, "watchdog healthcheck unrecovered after restart");
  assert.equal(signal.logsRef, "/tmp/event-watchdog-recovery.json");
  assert.deepEqual(signal.symptoms, [
    "before_reason=heartbeat_stale",
    "after_reason=process_not_running",
    "service_name=ghostcontrol-event-watchdog.service",
    "status_path=/tmp/watchdog.status.json",
    "max_stale_seconds=120",
  ]);
});
