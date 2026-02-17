import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DISK_PRESSURE_SUMMARY,
  LOCK_CONTENTION_SUMMARY,
  RPC_PREFLIGHT_SUMMARY,
  readEventCycleIncidentSummary,
} from "../apps/api/src/event_cycle_incidents.ts";
import { openIncidentDb } from "../incidents/db.ts";

test("event-cycle incident summary returns unavailable shape when DB is missing", async () => {
  const summary = await readEventCycleIncidentSummary({
    dbPath: "/tmp/ghostcontrol-missing-event-cycle-incidents.db",
    limit: 10,
  });

  assert.equal(summary.available, false);
  assert.equal(summary.alert.state, "ok");
  assert.equal(summary.alert.openIncidentThreshold, 1);
  assert.equal(summary.alert.openIncidentCount, 0);
  assert.equal(summary.totals.total, 0);
  assert.equal(summary.recent.length, 0);
});

test("event-cycle incident summary aggregates tracked governance incidents", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ghostcontrol-event-cycle-incidents-"));
  const dbPath = path.join(dir, "incidents.db");
  const db = openIncidentDb(dbPath);

  try {
    const insert = db.prepare(`
      INSERT INTO incidents (created_at, severity, service, summary, symptoms, logs_ref, signature, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      "2026-02-17T08:00:00.000Z",
      3,
      "event-cycle",
      LOCK_CONTENTION_SUMMARY,
      "lock wait exceeded",
      "/tmp/lock-open.log",
      "sig-lock-open",
      "open",
    );
    insert.run(
      "2026-02-17T08:05:00.000Z",
      2,
      "event-cycle",
      LOCK_CONTENTION_SUMMARY,
      "lock recovered",
      "/tmp/lock-mitigated.log",
      "sig-lock-mitigated",
      "mitigated",
    );
    insert.run(
      "2026-02-17T08:07:00.000Z",
      4,
      "event-cycle",
      RPC_PREFLIGHT_SUMMARY,
      "rpc preflight degraded",
      "/tmp/rpc-open.log",
      "sig-rpc-open",
      "open",
    );
    insert.run(
      "2026-02-17T08:09:00.000Z",
      1,
      "event-cycle",
      DISK_PRESSURE_SUMMARY,
      "disk pressure recovered",
      "/tmp/disk-closed.log",
      "sig-disk-closed",
      "closed",
    );
    insert.run(
      "2026-02-17T08:11:00.000Z",
      2,
      "event-cycle",
      "untracked event-cycle signal",
      "should be ignored by governance summary",
      "/tmp/untracked.log",
      "sig-untracked-open",
      "open",
    );
  } finally {
    db.close();
  }

  try {
    const summary = await readEventCycleIncidentSummary({ dbPath, limit: 20 });

    assert.equal(summary.available, true);
    assert.equal(summary.alert.state, "warning");
    assert.equal(summary.alert.openIncidentThreshold, 1);
    assert.equal(summary.alert.openIncidentCount, 2);
    assert.equal(summary.totals.open, 2);
    assert.equal(summary.totals.mitigated, 1);
    assert.equal(summary.totals.closed, 1);
    assert.equal(summary.totals.total, 4);

    assert.equal(summary.lockContention.open, 1);
    assert.equal(summary.lockContention.mitigated, 1);
    assert.equal(summary.lockContention.latestStatus, "mitigated");
    assert.equal(summary.lockContention.latestCreatedAtUtc, "2026-02-17T08:05:00.000Z");

    assert.equal(summary.rpcPreflight.open, 1);
    assert.equal(summary.rpcPreflight.latestStatus, "open");

    assert.equal(summary.diskPressure.closed, 1);
    assert.equal(summary.diskPressure.latestStatus, "closed");

    assert.equal(summary.recent.length, 4);
    assert.equal(summary.recent[0]?.summary, DISK_PRESSURE_SUMMARY);
    assert.equal(summary.recent[0]?.severityLabel, "info");
    assert.equal(summary.recent[1]?.summary, RPC_PREFLIGHT_SUMMARY);
    assert.equal(summary.recent[1]?.severityLabel, "critical");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("event-cycle incident summary reads from read-only sqlite snapshots", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ghostcontrol-event-cycle-readonly-"));
  const dbPath = path.join(dir, "incidents.db");
  const db = openIncidentDb(dbPath);

  try {
    db.prepare(`
      INSERT INTO incidents (created_at, severity, service, summary, symptoms, logs_ref, signature, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "2026-02-17T09:00:00.000Z",
      4,
      "event-cycle",
      RPC_PREFLIGHT_SUMMARY,
      "rpc preflight degraded",
      "/tmp/rpc-readonly.log",
      "sig-rpc-readonly",
      "open",
    );
  } finally {
    db.close();
  }

  // Simulate a read-only mounted file while preserving read access.
  chmodSync(dbPath, 0o444);
  try {
    const summary = await readEventCycleIncidentSummary({ dbPath, limit: 10 });
    assert.equal(summary.available, true);
    assert.equal(summary.alert.state, "warning");
    assert.equal(summary.alert.openIncidentThreshold, 1);
    assert.equal(summary.alert.openIncidentCount, 1);
    assert.equal(summary.totals.open, 1);
    assert.equal(summary.totals.total, 1);
    assert.equal(summary.rpcPreflight.latestStatus, "open");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("event-cycle incident summary honors custom open warning threshold", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ghostcontrol-event-cycle-threshold-"));
  const dbPath = path.join(dir, "incidents.db");
  const db = openIncidentDb(dbPath);

  try {
    db.prepare(`
      INSERT INTO incidents (created_at, severity, service, summary, symptoms, logs_ref, signature, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "2026-02-17T10:00:00.000Z",
      3,
      "event-cycle",
      LOCK_CONTENTION_SUMMARY,
      "lock timeout",
      "/tmp/lock-threshold.log",
      "sig-lock-threshold",
      "open",
    );
  } finally {
    db.close();
  }

  try {
    const summary = await readEventCycleIncidentSummary({
      dbPath,
      limit: 10,
      openWarnThreshold: 2,
    });
    assert.equal(summary.alert.state, "ok");
    assert.equal(summary.alert.openIncidentThreshold, 2);
    assert.equal(summary.alert.openIncidentCount, 1);
    assert.equal(summary.totals.open, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
