import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { collectIncidents } from "../incidents/collector.ts";
import { listOpenIncidents, openIncidentDb } from "../incidents/db.ts";

test("collector creates incidents.db and deduplicates by service+signature", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ghostcontrol-incidents-"));
  const dbPath = path.join(dir, "incidents.db");

  try {
    const signal = {
      service: "ghostcontrol-api",
      severity: "error" as const,
      summary: "rpc probe timeout",
      symptoms: ["rpc probe timeout", "endpoint unreachable"],
      logsRef: "/tmp/logs/api.log",
    };

    const first = collectIncidents({ dbPath, signals: [signal] });
    const second = collectIncidents({ dbPath, signals: [signal] });

    assert.equal(first.inserted, 1);
    assert.equal(first.deduped, 0);
    assert.equal(second.inserted, 0);
    assert.equal(second.deduped, 1);

    const db = openIncidentDb(dbPath);
    try {
      const rows = listOpenIncidents(db);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.service, "ghostcontrol-api");
      assert.equal(rows[0]?.summary, "rpc probe timeout");
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collector reopens recurring incidents after mitigation", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ghostcontrol-incidents-reopen-"));
  const dbPath = path.join(dir, "incidents.db");

  try {
    const signal = {
      service: "ghostcontrol-api",
      severity: "error" as const,
      summary: "rpc probe timeout",
      symptoms: ["rpc probe timeout", "endpoint unreachable"],
      logsRef: "/tmp/logs/api.log",
    };

    const first = collectIncidents({ dbPath, signals: [signal] });
    assert.equal(first.inserted, 1);
    assert.equal(first.deduped, 0);
    const firstId = first.touchedIncidentIds[0];
    assert.ok(firstId);

    const db = openIncidentDb(dbPath);
    try {
      db.prepare("UPDATE incidents SET status = 'mitigated' WHERE id = ?").run(firstId);
    } finally {
      db.close();
    }

    const second = collectIncidents({ dbPath, signals: [signal] });
    assert.equal(second.inserted, 1);
    assert.equal(second.deduped, 0);
    assert.notEqual(second.touchedIncidentIds[0], firstId);

    const db2 = openIncidentDb(dbPath);
    try {
      const openRows = listOpenIncidents(db2);
      assert.equal(openRows.length, 1);
      assert.equal(openRows[0]?.summary, "rpc probe timeout");
    } finally {
      db2.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
