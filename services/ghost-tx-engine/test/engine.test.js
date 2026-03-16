import test from "node:test";
import assert from "node:assert/strict";
import {
  hashRawTransaction,
  nextBackoffMs,
  normalizeLayer,
  sanitizeJob
} from "../src/engine.js";

test("normalizeLayer supports canonical layer names", () => {
  assert.equal(normalizeLayer("l1"), "L1");
  assert.equal(normalizeLayer("L2"), "L2");
  assert.equal(normalizeLayer("3"), "L3");
  assert.equal(normalizeLayer("invalid"), "");
});

test("hashRawTransaction is stable", () => {
  const a = hashRawTransaction("0x1234");
  const b = hashRawTransaction("0x1234");
  const c = hashRawTransaction("0xabcd");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("nextBackoffMs grows exponentially and caps", () => {
  assert.equal(nextBackoffMs(100, 1, 10_000), 100);
  assert.equal(nextBackoffMs(100, 3, 10_000), 400);
  assert.equal(nextBackoffMs(100, 10, 2_000), 2_000);
});

test("sanitizeJob hides raw transaction by default", () => {
  const job = {
    id: "job-1",
    rawTransaction: "0x1234",
    status: "queued"
  };
  assert.deepEqual(sanitizeJob(job), { id: "job-1", status: "queued" });
  assert.deepEqual(sanitizeJob(job, { includeRaw: true }), job);
});
