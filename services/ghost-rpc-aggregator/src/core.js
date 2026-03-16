export const CANONICAL_CHAIN_IDS = Object.freeze({
  L1: 14000101,
  L2: 901,
  L3: 903
});

const SAFE_METHODS = new Set([
  "ghost_blockNumber",
  "ghost_chainId",
  "ghost_feeHistory",
  "ghost_gasPrice",
  "ghost_getBalance",
  "ghost_getBlockByHash",
  "ghost_getBlockByNumber",
  "ghost_getCode",
  "ghost_getLogs",
  "ghost_getTransactionByHash",
  "ghost_getTransactionReceipt"
]);

const METHOD_TTLS_MS = Object.freeze({
  ghost_blockNumber: 250,
  ghost_chainId: 60_000,
  ghost_feeHistory: 1_500,
  ghost_gasPrice: 500,
  ghost_getBalance: 1_500,
  ghost_getBlockByHash: 5_000,
  ghost_getBlockByNumber: 1_000,
  ghost_getCode: 30_000,
  ghost_getLogs: 1_500,
  ghost_getTransactionByHash: 2_000,
  ghost_getTransactionReceipt: 3_000
});

export function normalizeLayer(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "L1" || normalized === "1") return "L1";
  if (normalized === "L2" || normalized === "2") return "L2";
  if (normalized === "L3" || normalized === "3") return "L3";
  return "";
}

export function parseUrlList(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isGhostRpcMethod(method) {
  return typeof method === "string" && method.startsWith("ghost_");
}

export function isCacheableMethod(method) {
  return SAFE_METHODS.has(method);
}

export function ttlForMethod(method, defaultTtlMs) {
  return METHOD_TTLS_MS[method] ?? defaultTtlMs;
}

export function buildCacheKey(layer, method, params) {
  return JSON.stringify([layer, method, params ?? []]);
}

export function createEndpoint(url) {
  return {
    url,
    inFlight: 0,
    consecutiveFailures: 0,
    openUntil: 0,
    verifiedChainId: null,
    disabled: false,
    disabledReason: "",
    lastLatencyMs: null,
    lastError: "",
    lastFailureAt: "",
    lastSuccessAt: ""
  };
}

export function recordEndpointSuccess(endpoint, latencyMs) {
  endpoint.consecutiveFailures = 0;
  endpoint.openUntil = 0;
  endpoint.lastLatencyMs = latencyMs;
  endpoint.lastError = "";
  endpoint.lastSuccessAt = new Date().toISOString();
}

export function recordEndpointFailure(endpoint, error, failureThreshold, cooldownMs) {
  endpoint.consecutiveFailures += 1;
  endpoint.lastError = error instanceof Error ? error.message : String(error);
  endpoint.lastFailureAt = new Date().toISOString();
  if (endpoint.consecutiveFailures >= failureThreshold) {
    endpoint.openUntil = Date.now() + cooldownMs;
  }
}

function endpointScore(endpoint, now) {
  if (endpoint.disabled) return Number.MAX_SAFE_INTEGER;
  if (endpoint.openUntil > now) return 1_000_000_000_000 + endpoint.openUntil;
  return (
    endpoint.inFlight * 10_000 +
    endpoint.consecutiveFailures * 1_000 +
    (endpoint.lastLatencyMs ?? 250)
  );
}

export function selectEndpoint(endpoints, cursor, now = Date.now()) {
  const candidates = endpoints
    .filter((endpoint) => !endpoint.disabled && endpoint.openUntil <= now)
    .sort((left, right) => {
      const scoreDelta = endpointScore(left, now) - endpointScore(right, now);
      if (scoreDelta !== 0) return scoreDelta;
      return left.url.localeCompare(right.url);
    });

  if (candidates.length === 0) return null;
  const index = cursor.value % candidates.length;
  cursor.value = (cursor.value + 1) % Number.MAX_SAFE_INTEGER;
  return candidates[index];
}

export function jsonRpcErrorResponse(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error
  };
}

export class LruTtlCache {
  #entries = new Map();
  #maxEntries;

  constructor(maxEntries) {
    this.#maxEntries = Math.max(1, Number(maxEntries) || 1);
  }

  get size() {
    return this.#entries.size;
  }

  get(key) {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return undefined;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs) {
    const ttl = Math.max(1, Number(ttlMs) || 1);
    if (this.#entries.has(key)) {
      this.#entries.delete(key);
    }
    this.#entries.set(key, {
      value,
      expiresAt: Date.now() + ttl
    });
    while (this.#entries.size > this.#maxEntries) {
      const firstKey = this.#entries.keys().next().value;
      if (firstKey === undefined) break;
      this.#entries.delete(firstKey);
    }
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.#entries.entries()) {
      if (entry.expiresAt <= now) {
        this.#entries.delete(key);
      }
    }
  }
}
