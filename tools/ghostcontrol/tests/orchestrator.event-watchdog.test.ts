import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFileFingerprintDigest,
  extractIterationFromEventCycleOutput,
  extractFiringAlertFingerprints,
  normalizeWatchFiles,
} from "../orchestrator/event_watchdog.ts";

test("extractFiringAlertFingerprints keeps only firing alerts and deduplicates", () => {
  const fingerprints = extractFiringAlertFingerprints({
    status: "success",
    data: {
      alerts: [
        {
          state: "firing",
          labels: { alertname: "HighErrorRate", instance: "api-1" },
        },
        {
          state: "pending",
          labels: { alertname: "DiskPressure", instance: "node-1" },
        },
        {
          state: "firing",
          labels: { instance: "api-1", alertname: "HighErrorRate" },
        },
      ],
    },
  });

  assert.equal(fingerprints.length, 1);
});

test("buildFileFingerprintDigest is stable regardless of input order", () => {
  const a = buildFileFingerprintDigest([
    { path: "/a", exists: true, size: 10, mtimeMs: 1001.6 },
    { path: "/b", exists: false, size: 0, mtimeMs: 0 },
  ]);
  const b = buildFileFingerprintDigest([
    { path: "/b", exists: false, size: 0, mtimeMs: 0 },
    { path: "/a", exists: true, size: 10, mtimeMs: 1001.6 },
  ]);

  assert.equal(a, b);
});

test("normalizeWatchFiles resolves relative paths and removes duplicates", () => {
  const files = normalizeWatchFiles([
    "tools/ghostcontrol/guards/config/network-rules.json",
    "/home/ghost/ghostl-stack/tools/ghostcontrol/guards/config/network-rules.json",
  ]);

  assert.equal(files.length, 1);
  assert.equal(
    files[0],
    "/home/ghost/ghostl-stack/tools/ghostcontrol/guards/config/network-rules.json",
  );
});

test("extractIterationFromEventCycleOutput parses event cycle completion line", () => {
  assert.equal(
    extractIterationFromEventCycleOutput("event_cycle_complete iteration=52"),
    52,
  );
  assert.equal(
    extractIterationFromEventCycleOutput("no iteration in this output"),
    null,
  );
});
