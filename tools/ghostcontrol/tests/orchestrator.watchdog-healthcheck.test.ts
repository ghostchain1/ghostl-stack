import assert from "node:assert/strict";
import test from "node:test";

import {
  isHeartbeatStale,
  parseHeartbeatUnixMs,
} from "../orchestrator/watchdog_healthcheck.ts";

test("parseHeartbeatUnixMs prefers numeric heartbeatUnixMs", () => {
  const value = parseHeartbeatUnixMs({
    heartbeatUnixMs: 1_700_000_000_000,
    heartbeatAt: "2026-02-17T00:00:00.000Z",
  });

  assert.equal(value, 1_700_000_000_000);
});

test("parseHeartbeatUnixMs falls back to heartbeatAt ISO timestamp", () => {
  const value = parseHeartbeatUnixMs({
    heartbeatAt: "2026-02-17T00:00:00.000Z",
  });

  assert.equal(value, Date.parse("2026-02-17T00:00:00.000Z"));
});

test("parseHeartbeatUnixMs returns null for invalid payload", () => {
  assert.equal(parseHeartbeatUnixMs({}), null);
  assert.equal(parseHeartbeatUnixMs(null), null);
  assert.equal(parseHeartbeatUnixMs({ heartbeatAt: "not-a-date" }), null);
});

test("isHeartbeatStale returns true only when age exceeds threshold", () => {
  const now = 1_000_000;
  const max = 60_000;

  assert.equal(
    isHeartbeatStale({ heartbeatUnixMs: now - 59_999, nowUnixMs: now, maxStaleMs: max }),
    false,
  );
  assert.equal(
    isHeartbeatStale({ heartbeatUnixMs: now - 60_001, nowUnixMs: now, maxStaleMs: max }),
    true,
  );
});
