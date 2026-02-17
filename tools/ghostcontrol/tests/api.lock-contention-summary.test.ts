import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readLockContentionMitigationSummary } from "../apps/api/src/lock_contention.ts";

test("lock-contention summary returns empty shape when log directory is missing", async () => {
  const summary = await readLockContentionMitigationSummary({
    logDir: "/tmp/ghostcontrol-missing-lock-mitigation-dir",
    limit: 10,
  });

  assert.equal(summary.latest, null);
  assert.equal(summary.recent.length, 0);
  assert.equal(summary.totals.samples, 0);
  assert.equal(summary.totals.totalMitigated, 0);
});

test("lock-contention summary loads latest mitigation snapshots and totals", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ghostcontrol-lock-summary-"));
  try {
    writeFileSync(
      path.join(dir, "iteration-5-lock-contention-mitigation.json"),
      JSON.stringify({
        status: "ok",
        openBefore: 2,
        mitigatedCount: 2,
        openAfter: 0,
        generatedAtUtc: "2026-02-17T01:00:00.000Z",
      }),
      "utf8",
    );
    writeFileSync(
      path.join(dir, "iteration-7-lock-contention-mitigation.json"),
      JSON.stringify({
        status: "ok",
        openBefore: 0,
        mitigatedCount: 0,
        openAfter: 0,
        generatedAtUtc: "2026-02-17T01:05:00.000Z",
      }),
      "utf8",
    );
    writeFileSync(
      path.join(dir, "iteration-8-lock-contention-mitigation.json"),
      "{invalid-json",
      "utf8",
    );
    writeFileSync(path.join(dir, "notes.txt"), "ignore", "utf8");

    const summary = await readLockContentionMitigationSummary({
      logDir: dir,
      limit: 20,
    });

    assert.equal(summary.recent.length, 2);
    assert.equal(summary.latest?.iteration, 7);
    assert.equal(summary.latest?.openBefore, 0);
    assert.equal(summary.totals.samples, 2);
    assert.equal(summary.totals.runsWithOpen, 1);
    assert.equal(summary.totals.totalOpenBefore, 2);
    assert.equal(summary.totals.totalMitigated, 2);
    assert.equal(summary.totals.maxOpenBefore, 2);
    assert.equal(summary.totals.lastGeneratedAtUtc, "2026-02-17T01:05:00.000Z");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lock-contention summary prioritizes generatedAtUtc over iteration ordering", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ghostcontrol-lock-summary-time-"));
  try {
    writeFileSync(
      path.join(dir, "iteration-580-lock-contention-mitigation.json"),
      JSON.stringify({
        status: "ok",
        openBefore: 1,
        mitigatedCount: 1,
        openAfter: 0,
        generatedAtUtc: "2026-02-17T02:26:21.131Z",
      }),
      "utf8",
    );
    writeFileSync(
      path.join(dir, "iteration-54-lock-contention-mitigation.json"),
      JSON.stringify({
        status: "ok",
        openBefore: 0,
        mitigatedCount: 0,
        openAfter: 0,
        generatedAtUtc: "2026-02-17T02:26:55.347Z",
      }),
      "utf8",
    );

    const summary = await readLockContentionMitigationSummary({
      logDir: dir,
      limit: 20,
    });

    assert.equal(summary.latest?.iteration, 54);
    assert.equal(summary.latest?.generatedAtUtc, "2026-02-17T02:26:55.347Z");
    assert.equal(summary.recent[0]?.iteration, 54);
    assert.equal(summary.recent[1]?.iteration, 580);
    assert.equal(summary.totals.lastGeneratedAtUtc, "2026-02-17T02:26:55.347Z");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
