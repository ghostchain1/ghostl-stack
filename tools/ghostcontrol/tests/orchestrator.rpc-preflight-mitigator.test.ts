import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { collectIncidents } from "../incidents/collector.ts";
import { openIncidentDb } from "../incidents/db.ts";
import {
  mitigateRpcPreflightIncidents,
  parseRpcPreflightMitigatorArgs,
  RPC_PREFLIGHT_INCIDENT_SERVICE,
  RPC_PREFLIGHT_INCIDENT_SUMMARY,
} from "../orchestrator/rpc_preflight_mitigator.ts";

test("rpc preflight mitigator marks open rpc-preflight incidents as mitigated", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ghostcontrol-rpc-preflight-mitigator-"));
  const dbPath = path.join(dir, "incidents.db");
  const logPath = path.join(dir, "rpc-preflight-mitigation.json");

  try {
    const inserted = collectIncidents({
      dbPath,
      signals: [
        {
          service: RPC_PREFLIGHT_INCIDENT_SERVICE,
          severity: "critical",
          summary: RPC_PREFLIGHT_INCIDENT_SUMMARY,
          symptoms: ["l1:fetch_error", "mode=fail"],
        },
        {
          service: RPC_PREFLIGHT_INCIDENT_SERVICE,
          severity: "critical",
          summary: RPC_PREFLIGHT_INCIDENT_SUMMARY,
          symptoms: ["l2:timeout", "mode=fail"],
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

    const result = await mitigateRpcPreflightIncidents({
      dbPath,
      logPath,
      sourcePreflightLogPath: "/tmp/source-preflight.json",
      trigger: "auto_remediation_recovered",
    });

    assert.equal(result.status, "ok");
    assert.equal(result.trigger, "auto_remediation_recovered");
    assert.equal(result.openBefore, 2);
    assert.equal(result.mitigatedCount, 2);
    assert.equal(result.mitigatedIncidentIds.length, 2);
    assert.equal(result.openAfter, 0);

    const db = openIncidentDb(dbPath);
    try {
      const openRpcCount = Number(
        (
          db.prepare(
            "SELECT COUNT(*) AS c FROM incidents WHERE service = ? AND summary = ? AND status = 'open'",
          ).get(RPC_PREFLIGHT_INCIDENT_SERVICE, RPC_PREFLIGHT_INCIDENT_SUMMARY) as { c: number }
        ).c,
      );
      const mitigatedRpcCount = Number(
        (
          db.prepare(
            "SELECT COUNT(*) AS c FROM incidents WHERE service = ? AND summary = ? AND status = 'mitigated'",
          ).get(RPC_PREFLIGHT_INCIDENT_SERVICE, RPC_PREFLIGHT_INCIDENT_SUMMARY) as { c: number }
        ).c,
      );
      const unrelatedOpenCount = Number(
        (
          db.prepare(
            "SELECT COUNT(*) AS c FROM incidents WHERE summary = 'unrelated event-cycle signal' AND status = 'open'",
          ).get() as { c: number }
        ).c,
      );

      assert.equal(openRpcCount, 0);
      assert.equal(mitigatedRpcCount, 2);
      assert.equal(unrelatedOpenCount, 1);
    } finally {
      db.close();
    }

    const log = JSON.parse(readFileSync(logPath, "utf8")) as {
      status: string;
      trigger: string;
      mitigatedCount: number;
      openAfter: number;
    };
    assert.equal(log.status, "ok");
    assert.equal(log.trigger, "auto_remediation_recovered");
    assert.equal(log.mitigatedCount, 2);
    assert.equal(log.openAfter, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseRpcPreflightMitigatorArgs validates non-empty db/log paths", () => {
  assert.throws(
    () => parseRpcPreflightMitigatorArgs(["--db-path", " "]),
    /invalid_db_path/,
  );
  assert.throws(
    () => parseRpcPreflightMitigatorArgs(["--log-path", " "]),
    /invalid_log_path/,
  );
});
