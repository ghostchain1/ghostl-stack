import { createServer } from "node:http";
import { createRequire } from "node:module";
import {
  CANONICAL_CHAIN_IDS,
  LruTtlCache,
  buildCacheKey,
  createEndpoint,
  isCacheableMethod,
  isGhostRpcMethod,
  jsonRpcErrorResponse,
  normalizeLayer,
  parseUrlList,
  recordEndpointFailure,
  recordEndpointSuccess,
  selectEndpoint,
  ttlForMethod
} from "./core.js";

const require = createRequire(import.meta.url);
const { GhostProvider } = require("../../../packages/ghost-sdk-core/src/provider/GhostProvider.js");

const PORT = Number(process.env.PORT ?? 7615);
const HOST = process.env.HOST ?? "0.0.0.0";
const MAX_BODY_BYTES = Math.max(1_024, Number(process.env.RPC_MAX_BODY_BYTES ?? 1_048_576));
const REQUEST_TIMEOUT_MS = Math.max(500, Number(process.env.RPC_REQUEST_TIMEOUT_MS ?? 4_000));
const MAX_CONCURRENT_FORWARD = Math.max(1, Number(process.env.RPC_MAX_CONCURRENT_FORWARD ?? 128));
const CACHE_DEFAULT_TTL_MS = Math.max(50, Number(process.env.RPC_CACHE_DEFAULT_TTL_MS ?? 1_000));
const CACHE_MAX_ENTRIES = Math.max(16, Number(process.env.RPC_CACHE_MAX_ENTRIES ?? 2_048));
const CIRCUIT_FAILURES = Math.max(1, Number(process.env.RPC_CIRCUIT_FAILURES ?? 3));
const CIRCUIT_COOLDOWN_MS = Math.max(1_000, Number(process.env.RPC_CIRCUIT_COOLDOWN_MS ?? 15_000));
const VERIFY_INTERVAL_MS = Math.max(5_000, Number(process.env.RPC_VERIFY_INTERVAL_MS ?? 60_000));

const configuredUrls = {
  L1: parseUrlList(process.env.RPC_L1_URLS ?? "http://127.0.0.1:18545"),
  L2: parseUrlList(process.env.RPC_L2_URLS ?? "http://127.0.0.1:29545"),
  L3: parseUrlList(process.env.RPC_L3_URLS ?? "http://127.0.0.1:39545")
};

const pools = {
  L1: configuredUrls.L1.map(createEndpoint),
  L2: configuredUrls.L2.map(createEndpoint),
  L3: configuredUrls.L3.map(createEndpoint)
};

const cursors = {
  L1: { value: 0 },
  L2: { value: 0 },
  L3: { value: 0 }
};

const cache = new LruTtlCache(CACHE_MAX_ENTRIES);
const inFlight = new Map();
const metrics = {
  requestsTotal: 0,
  batchRequestsTotal: 0,
  cacheHits: 0,
  cacheMisses: 0,
  upstreamRequests: 0,
  upstreamRetries: 0,
  upstreamErrors: 0,
  namespaceRejected: 0,
  busyRejected: 0
};

let activeForwards = 0;
let lastVerificationAt = "";
let lastVerificationError = "";

function summarizePools() {
  return Object.fromEntries(
    Object.entries(pools).map(([layer, endpoints]) => [
      layer,
      endpoints.map((endpoint) => ({
        url: endpoint.url,
        inFlight: endpoint.inFlight,
        consecutiveFailures: endpoint.consecutiveFailures,
        openUntil: endpoint.openUntil ? new Date(endpoint.openUntil).toISOString() : null,
        verifiedChainId: endpoint.verifiedChainId,
        disabled: endpoint.disabled,
        disabledReason: endpoint.disabledReason,
        lastLatencyMs: endpoint.lastLatencyMs,
        lastError: endpoint.lastError,
        lastFailureAt: endpoint.lastFailureAt,
        lastSuccessAt: endpoint.lastSuccessAt
      }))
    ])
  );
}

function readyState() {
  return Object.entries(pools).every(([, endpoints]) =>
    endpoints.some((endpoint) => !endpoint.disabled)
  );
}

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function text(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error("payload_too_large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim().length === 0) {
    throw new Error("empty_body");
  }
  return JSON.parse(raw);
}

async function verifyEndpoints() {
  const layers = ["L1", "L2", "L3"];
  try {
    await Promise.all(
      layers.map(async (layer) => {
        const expectedChainId = CANONICAL_CHAIN_IDS[layer];
        await Promise.all(
          pools[layer].map(async (endpoint) => {
            try {
              const provider = new GhostProvider(endpoint.url, { timeoutMs: REQUEST_TIMEOUT_MS });
              const chainId = await provider.ghost_chainId();
              endpoint.verifiedChainId = chainId;
              if (chainId !== expectedChainId) {
                endpoint.disabled = true;
                endpoint.disabledReason = `chain_id_mismatch_expected_${expectedChainId}_got_${chainId}`;
                endpoint.lastError = endpoint.disabledReason;
                return;
              }
              endpoint.disabled = false;
              endpoint.disabledReason = "";
            } catch (error) {
              endpoint.lastError = error instanceof Error ? error.message : String(error);
            }
          })
        );
      })
    );
    lastVerificationAt = new Date().toISOString();
    lastVerificationError = "";
  } catch (error) {
    lastVerificationAt = new Date().toISOString();
    lastVerificationError = error instanceof Error ? error.message : String(error);
  }
}

async function forwardOnce(layer, requestPayload, attemptOrder) {
  const endpoint = selectEndpoint(pools[layer], cursors[layer]);
  if (!endpoint || attemptOrder.has(endpoint.url)) {
    throw new Error(`no_healthy_upstream_${layer.toLowerCase()}`);
  }
  attemptOrder.add(endpoint.url);
  endpoint.inFlight += 1;
  activeForwards += 1;
  const startedAt = Date.now();
  try {
    metrics.upstreamRequests += 1;
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(requestPayload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      throw new Error(`upstream_http_${response.status}`);
    }
    const body = await response.json();
    recordEndpointSuccess(endpoint, latencyMs);
    return body;
  } catch (error) {
    metrics.upstreamErrors += 1;
    recordEndpointFailure(endpoint, error, CIRCUIT_FAILURES, CIRCUIT_COOLDOWN_MS);
    throw error;
  } finally {
    endpoint.inFlight = Math.max(0, endpoint.inFlight - 1);
    activeForwards = Math.max(0, activeForwards - 1);
  }
}

async function forwardRequest(layer, requestPayload) {
  const attemptOrder = new Set();
  const pool = pools[layer];
  let lastError = null;
  for (let attempt = 0; attempt < pool.length; attempt += 1) {
    try {
      if (attempt > 0) metrics.upstreamRetries += 1;
      return await forwardOnce(layer, requestPayload, attemptOrder);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`no_upstream_available_${layer.toLowerCase()}`);
}

async function handleSingleRpc(layer, requestPayload) {
  if (!requestPayload || typeof requestPayload !== "object" || Array.isArray(requestPayload)) {
    return jsonRpcErrorResponse(null, -32600, "invalid_request");
  }
  if (requestPayload.id === undefined) {
    return jsonRpcErrorResponse(null, -32600, "request_id_required");
  }
  if (!isGhostRpcMethod(requestPayload.method)) {
    metrics.namespaceRejected += 1;
    return jsonRpcErrorResponse(
      requestPayload.id,
      -32601,
      "ghost_namespace_required",
      { method: requestPayload.method }
    );
  }
  if (activeForwards >= MAX_CONCURRENT_FORWARD) {
    metrics.busyRejected += 1;
    return jsonRpcErrorResponse(requestPayload.id, -32000, "rpc_aggregator_busy");
  }

  const params = Array.isArray(requestPayload.params) ? requestPayload.params : requestPayload.params ?? [];
  const cacheable = isCacheableMethod(requestPayload.method);
  const cacheKey = cacheable ? buildCacheKey(layer, requestPayload.method, params) : "";

  if (cacheable) {
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      metrics.cacheHits += 1;
      return {
        jsonrpc: "2.0",
        id: requestPayload.id,
        result: cached
      };
    }
    metrics.cacheMisses += 1;
    if (inFlight.has(cacheKey)) {
      const shared = await inFlight.get(cacheKey);
      if (shared.error) {
        return {
          jsonrpc: "2.0",
          id: requestPayload.id,
          error: shared.error
        };
      }
      return {
        jsonrpc: "2.0",
        id: requestPayload.id,
        result: shared.result
      };
    }
  }

  const execute = async () => {
    const upstreamResponse = await forwardRequest(layer, {
      jsonrpc: "2.0",
      id: requestPayload.id,
      method: requestPayload.method,
      params
    });
    if (upstreamResponse?.error) {
      return { error: upstreamResponse.error };
    }
    if (cacheable && upstreamResponse?.result !== undefined) {
      cache.set(cacheKey, upstreamResponse.result, ttlForMethod(requestPayload.method, CACHE_DEFAULT_TTL_MS));
    }
    return { result: upstreamResponse?.result };
  };

  if (!cacheable) {
    const outcome = await execute();
    return outcome.error
      ? { jsonrpc: "2.0", id: requestPayload.id, error: outcome.error }
      : { jsonrpc: "2.0", id: requestPayload.id, result: outcome.result };
  }

  const sharedPromise = execute()
    .catch((error) => ({
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error)
      }
    }))
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, sharedPromise);
  const outcome = await sharedPromise;
  return outcome.error
    ? { jsonrpc: "2.0", id: requestPayload.id, error: outcome.error }
    : { jsonrpc: "2.0", id: requestPayload.id, result: outcome.result };
}

async function handleRpc(layer, body) {
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return jsonRpcErrorResponse(null, -32600, "empty_batch");
    }
    metrics.batchRequestsTotal += 1;
    return Promise.all(body.map((requestPayload) => handleSingleRpc(layer, requestPayload)));
  }
  return handleSingleRpc(layer, body);
}

function metricsResponse() {
  cache.prune();
  const lines = [
    "# HELP ghost_rpc_aggregator_requests_total Total RPC requests seen by the aggregator",
    "# TYPE ghost_rpc_aggregator_requests_total counter",
    `ghost_rpc_aggregator_requests_total ${metrics.requestsTotal}`,
    "# HELP ghost_rpc_aggregator_batch_requests_total Total batch RPC requests",
    "# TYPE ghost_rpc_aggregator_batch_requests_total counter",
    `ghost_rpc_aggregator_batch_requests_total ${metrics.batchRequestsTotal}`,
    "# HELP ghost_rpc_aggregator_cache_hits_total Total cache hits",
    "# TYPE ghost_rpc_aggregator_cache_hits_total counter",
    `ghost_rpc_aggregator_cache_hits_total ${metrics.cacheHits}`,
    "# HELP ghost_rpc_aggregator_cache_misses_total Total cache misses",
    "# TYPE ghost_rpc_aggregator_cache_misses_total counter",
    `ghost_rpc_aggregator_cache_misses_total ${metrics.cacheMisses}`,
    "# HELP ghost_rpc_aggregator_upstream_requests_total Total upstream RPC attempts",
    "# TYPE ghost_rpc_aggregator_upstream_requests_total counter",
    `ghost_rpc_aggregator_upstream_requests_total ${metrics.upstreamRequests}`,
    "# HELP ghost_rpc_aggregator_upstream_retries_total Total upstream retries",
    "# TYPE ghost_rpc_aggregator_upstream_retries_total counter",
    `ghost_rpc_aggregator_upstream_retries_total ${metrics.upstreamRetries}`,
    "# HELP ghost_rpc_aggregator_upstream_errors_total Total upstream errors",
    "# TYPE ghost_rpc_aggregator_upstream_errors_total counter",
    `ghost_rpc_aggregator_upstream_errors_total ${metrics.upstreamErrors}`,
    "# HELP ghost_rpc_aggregator_namespace_rejected_total Total non-ghost namespace rejections",
    "# TYPE ghost_rpc_aggregator_namespace_rejected_total counter",
    `ghost_rpc_aggregator_namespace_rejected_total ${metrics.namespaceRejected}`,
    "# HELP ghost_rpc_aggregator_busy_rejected_total Total busy rejections",
    "# TYPE ghost_rpc_aggregator_busy_rejected_total counter",
    `ghost_rpc_aggregator_busy_rejected_total ${metrics.busyRejected}`,
    "# HELP ghost_rpc_aggregator_cache_entries Current cache entry count",
    "# TYPE ghost_rpc_aggregator_cache_entries gauge",
    `ghost_rpc_aggregator_cache_entries ${cache.size}`,
    "# HELP ghost_rpc_aggregator_inflight Current in-flight dedupe count",
    "# TYPE ghost_rpc_aggregator_inflight gauge",
    `ghost_rpc_aggregator_inflight ${inFlight.size}`,
    "# HELP ghost_rpc_aggregator_active_forwards Current upstream requests in flight",
    "# TYPE ghost_rpc_aggregator_active_forwards gauge",
    `ghost_rpc_aggregator_active_forwards ${activeForwards}`
  ];
  return `${lines.join("\n")}\n`;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const layer = normalizeLayer(url.pathname.split("/").at(-1) ?? url.searchParams.get("layer") ?? "");

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        service: "ghost-rpc-aggregator",
        status: readyState() ? "ok" : "degraded",
        cacheEntries: cache.size,
        activeForwards,
        uptimeSeconds: Math.round(process.uptime()),
        memory: process.memoryUsage(),
        lastVerificationAt,
        lastVerificationError
      });
    }

    if (req.method === "GET" && url.pathname === "/readyz") {
      return json(res, readyState() ? 200 : 503, {
        ok: readyState()
      });
    }

    if (req.method === "GET" && url.pathname === "/status") {
      cache.prune();
      return json(res, 200, {
        ok: true,
        configuredUrls,
        pools: summarizePools(),
        cacheEntries: cache.size,
        dedupedRequestsInFlight: inFlight.size,
        activeForwards,
        metrics,
        lastVerificationAt,
        lastVerificationError
      });
    }

    if (req.method === "GET" && url.pathname === "/metrics") {
      return text(res, 200, metricsResponse());
    }

    if (req.method === "POST" && layer && url.pathname.startsWith("/rpc/")) {
      metrics.requestsTotal += 1;
      const body = await readJsonBody(req);
      const responseBody = await handleRpc(layer, body);
      return json(res, 200, responseBody);
    }

    return json(res, 404, {
      ok: false,
      error: "not_found"
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json(res, 400, { ok: false, error: "invalid_json" });
    }
    if (error instanceof Error && error.message === "payload_too_large") {
      return json(res, 413, { ok: false, error: "payload_too_large" });
    }
    return json(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 30_000;

await verifyEndpoints();
setInterval(() => {
  void verifyEndpoints();
}, VERIFY_INTERVAL_MS).unref();
setInterval(() => {
  cache.prune();
}, Math.max(1_000, CACHE_DEFAULT_TTL_MS)).unref();

server.listen(PORT, HOST, () => {
  console.log(`[ghost-rpc-aggregator] listening on ${HOST}:${PORT}`);
});
