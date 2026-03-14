import assert from "node:assert/strict";
import test from "node:test";

import {
  extractNetworkErrorCode,
  fetchWithRetry,
} from "../apps/ui/app/lib/api-client.ts";

test("fetchWithRetry retries on transient DNS failures and succeeds", async () => {
  let calls = 0;
  const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
  const fetchImpl: typeof fetch = (async () => {
    calls += 1;
    if (calls < 3) {
      const err = new TypeError("fetch failed") as TypeError & { cause?: { code: string } };
      err.cause = { code: "EAI_AGAIN" };
      throw err;
    }
    return response;
  }) as typeof fetch;

  const slept: number[] = [];
  const result = await fetchWithRetry(
    "http://ghostcontrol-api:8080/status",
    {},
    {
      attempts: 3,
      baseDelayMs: 25,
      maxDelayMs: 50,
      fetchImpl,
      sleep: async (ms) => {
        slept.push(ms);
      },
    },
  );

  assert.equal(result.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(slept, [25, 50]);
});

test("fetchWithRetry does not retry on client errors", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = (async () => {
    calls += 1;
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const res = await fetchWithRetry(
    "http://ghostcontrol-api:8080/incidents",
    {},
    { attempts: 3, fetchImpl },
  );
  assert.equal(res.status, 404);
  assert.equal(calls, 1);
});

test("extractNetworkErrorCode reads nested fetch error causes", () => {
  const err = new TypeError("fetch failed") as TypeError & { cause?: { code: string } };
  err.cause = { code: "EAI_AGAIN" };
  assert.equal(extractNetworkErrorCode(err), "EAI_AGAIN");
});
