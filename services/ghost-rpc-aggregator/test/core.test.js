import test from "node:test";
import assert from "node:assert/strict";
import {
  LruTtlCache,
  buildCacheKey,
  createEndpoint,
  isCacheableMethod,
  isGhostRpcMethod,
  normalizeLayer,
  recordEndpointFailure,
  selectEndpoint
} from "../src/core.js";

test("normalizeLayer canonicalizes supported layer names", () => {
  assert.equal(normalizeLayer("l1"), "L1");
  assert.equal(normalizeLayer("2"), "L2");
  assert.equal(normalizeLayer("L3"), "L3");
  assert.equal(normalizeLayer("unknown"), "");
});

test("ghost namespace validation rejects non-ghost methods", () => {
  assert.equal(isGhostRpcMethod("ghost_blockNumber"), true);
  assert.equal(isGhostRpcMethod("eth_blockNumber"), false);
  assert.equal(isCacheableMethod("ghost_getBalance"), true);
  assert.equal(isCacheableMethod("ghost_sendRawTransaction"), false);
});

test("cache key includes layer and params", () => {
  assert.notEqual(
    buildCacheKey("L1", "ghost_getBalance", ["0xabc", "latest"]),
    buildCacheKey("L2", "ghost_getBalance", ["0xabc", "latest"])
  );
});

test("LruTtlCache evicts expired entries and oldest entries", async () => {
  const cache = new LruTtlCache(2);
  cache.set("a", 1, 5);
  cache.set("b", 2, 1000);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(cache.get("a"), undefined);
  cache.set("c", 3, 1000);
  cache.set("d", 4, 1000);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), 3);
  assert.equal(cache.get("d"), 4);
});

test("endpoint selection skips open endpoints", () => {
  const cursor = { value: 0 };
  const healthy = createEndpoint("http://healthy");
  const open = createEndpoint("http://open");
  recordEndpointFailure(open, new Error("boom"), 1, 60_000);
  const selected = selectEndpoint([open, healthy], cursor, Date.now());
  assert.equal(selected?.url, healthy.url);
});
