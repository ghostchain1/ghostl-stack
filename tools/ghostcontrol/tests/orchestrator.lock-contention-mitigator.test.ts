import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { collectIncidents } from "../incidents/collector.ts";
import { openIncidentDb } from "../incidents/db.ts";
import {
  LOCK_CONTENTION_INCIDENT_SERVICE,
  LOCK_CONTENTION_INCIDENT_SUMMARY,
  mitigateLockContentionIncidents,
  parseLockMitigatorArgs,
} from "../orchestrator/lock_contention_mitigator.ts";

test("lock-contention mitigator marks open lock-timeout incidents as mitigated", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ghostcontrol-lock-mitigator-"));
  const dbPath = path.join(dir, "incidents.db");
  const logPath = path.join(dir, "lock-mitigation.json");

  try {
    const inserted = collectIncidents({
      dbPath,
      signals: [
        {
          service: LOCK_CONTENTION_INCIDENT_SERVICE,
          severity: "error",
          summary: LOCK_CONTENTION_INCIDENT_SUMMARY,
          symptoms: ["event_reason=a", "vm_target=devnet"],
        },
        {
          service: LOCK_CONTENTION_INCIDENT_SERVICE,
          severity: "error",
          summary: LOCK_CONTENTION_INCIDENT_SUMMARY,
          symptoms: ["event_reason=b", "vm_target=devnet"],
        },
        {
          service: "event-cycle",
          severity: "warn",
          summary: "unrelated event-cycle signal",
          symptoms: ["unrelated=1"],
        },
      ],
    });
    assert.equal(inserted.inserted, 3);

    const result = await mitigateLockContentionIncidents({
      dbPath,
      logPath,
      iteration: 99,
    });
    assert.equal(result.status, "ok");
    assert.equal(result.iteration, 99);
    assert.equal(result.openBefore, 2);
    assert.equal(result.mitigatedCount, 2);
    assert.equal(result.mitigatedIncidentIds.length, 2);
    assert.equal(result.openAfter, 0);

    const db = openIncidentDb(dbPath);
    try {
      const openLockCount = Number(
        (
          db.prepare(
            "SELECT COUNT(*) AS c FROM incidents WHERE service = ? AND summary = ? AND status = 'open'",
          ).get(LOCK_CONTENTION_INCIDENT_SERVICE, LOCK_CONTENTION_INCIDENT_SUMMARY) as { c: number }
        ).c,
      );
      const mitigatedLockCount = Number(
        (
          db.prepare(
            "SELECT COUNT(*) AS c FROM incidents WHERE service = ? AND summary = ? AND status = 'mitigated'",
          ).get(LOCK_CONTENTION_INCIDENT_SERVICE, LOCK_CONTENTION_INCIDENT_SUMMARY) as { c: number }
        ).c,
      );
      const unrelatedOpenCount = Number(
        (
          db.prepare(
            "SELECT COUNT(*) AS c FROM incidents WHERE summary = 'unrelated event-cycle signal' AND status = 'open'",
          ).get() as { c: number }
        ).c,
      );
      assert.equal(openLockCount, 0);
      assert.equal(mitigatedLockCount, 2);
      assert.equal(unrelatedOpenCount, 1);
    } finally {
      db.close();
    }

    const log = JSON.parse(readFileSync(logPath, "utf8")) as {
      status: string;
      iteration: number;
      mitigatedCount: number;
      openAfter: number;
    };
    assert.equal(log.status, "ok");
    assert.equal(log.iteration, 99);
    assert.equal(log.mitigatedCount, 2);
    assert.equal(log.openAfter, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseLockMitigatorArgs validates iteration", () => {
  assert.throws(
    () => parseLockMitigatorArgs(["--iteration", "0"]),
    /invalid_iteration/,
  );
});
