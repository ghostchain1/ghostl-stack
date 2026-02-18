import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readRpcPreflightMitigationSummary } from "../apps/api/src/rpc_preflight.ts";

test("rpc-preflight summary returns empty shape when log directory is missing", async () => {
  const summary = await readRpcPreflightMitigationSummary({
    logDir: "/tmp/ghostcontrol-missing-rpc-preflight-dir",
    limit: 10,
  });

  assert.equal(summary.latest, null);
  assert.equal(summary.recent.length, 0);
  assert.equal(summary.totals.samples, 0);
  assert.equal(summary.totals.totalMitigated, 0);
});

test("rpc-preflight summary loads mitigation snapshots and totals", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ghostcontrol-rpc-preflight-summary-"));
  try {
    writeFileSync(
      path.join(dir, "event-cycle-rpc-preflight-mitigation-20260217T040000Z.json"),
      JSON.stringify({
        status: "ok",
        trigger: "auto_remediation_recovered",
        openBefore: 2,
        mitigatedCount: 2,
        openAfter: 0,
        generatedAtUtc: "2026-02-17T04:00:00.000Z",
      }),
      "utf8",
    );
    writeFileSync(
      path.join(dir, "manual-rpc-preflight-mitigation-20260217T040500Z.json"),
      JSON.stringify({
        status: "ok",
        trigger: "manual",
        openBefore: 4,
        mitigatedCount: 4,
        openAfter: 0,
        generatedAtUtc: "2026-02-17T04:05:00.000Z",
      }),
      "utf8",
    );
    writeFileSync(
      path.join(dir, "event-cycle-rpc-preflight-mitigation-20260217T041000Z.json"),
      "{invalid-json",
      "utf8",
    );
    writeFileSync(path.join(dir, "notes.txt"), "ignore", "utf8");

    const summary = await readRpcPreflightMitigationSummary({
      logDir: dir,
      limit: 20,
    });

    assert.equal(summary.recent.length, 2);
    assert.equal(summary.latest?.trigger, "manual");
    assert.equal(summary.latest?.openBefore, 4);
    assert.equal(summary.totals.samples, 2);
    assert.equal(summary.totals.runsWithOpen, 2);
    assert.equal(summary.totals.totalOpenBefore, 6);
    assert.equal(summary.totals.totalMitigated, 6);
    assert.equal(summary.totals.maxOpenBefore, 4);
    assert.equal(summary.totals.lastGeneratedAtUtc, "2026-02-17T04:05:00.000Z");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rpc-preflight summary prioritizes generatedAtUtc over filename ordering", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ghostcontrol-rpc-preflight-summary-time-"));
  try {
    writeFileSync(
      path.join(dir, "event-cycle-rpc-preflight-mitigation-20260217T041000Z.json"),
      JSON.stringify({
        status: "ok",
        trigger: "auto_remediation_recovered",
        openBefore: 1,
        mitigatedCount: 1,
        openAfter: 0,
        generatedAtUtc: "2026-02-17T04:10:00.000Z",
      }),
      "utf8",
    );
    writeFileSync(
      path.join(dir, "event-cycle-rpc-preflight-mitigation-20260217T041500Z.json"),
      JSON.stringify({
        status: "ok",
        trigger: "auto_remediation_recovered",
        openBefore: 0,
        mitigatedCount: 0,
        openAfter: 0,
        generatedAtUtc: "2026-02-17T04:15:00.000Z",
      }),
      "utf8",
    );

    const summary = await readRpcPreflightMitigationSummary({
      logDir: dir,
      limit: 20,
    });

    assert.equal(summary.latest?.generatedAtUtc, "2026-02-17T04:15:00.000Z");
    assert.equal(summary.recent[0]?.openBefore, 0);
    assert.equal(summary.recent[1]?.openBefore, 1);
    assert.equal(summary.totals.lastGeneratedAtUtc, "2026-02-17T04:15:00.000Z");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
