import http from "node:http";
import fs from "node:fs";

const PORT = Number(process.env.PORT || "8546");
const UPSTREAM_URL = process.env.UPSTREAM_URL || "http://anvil:8545";
const LOG_REQUESTS = process.env.LOG_REQUESTS === "1";
const readSecret = (key) => {
  const filePath = process.env[`${key}_FILE`];
  if (filePath) {
    try {
      const value = fs.readFileSync(filePath, "utf8").trim();
      if (value) return value;
    } catch {
      // ignore
    }
  }
  return process.env[key] || "";
};
const RPC_AUTH_TOKEN = readSecret("RPC_AUTH_TOKEN");
const RPC_REQUIRE_AUTH = process.env.RPC_REQUIRE_AUTH === "1";
const RPC_SENSITIVE_METHODS = (process.env.RPC_SENSITIVE_METHODS || "personal_,debug_,txpool_,admin_")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const RPC_RATE_LIMIT_PER_MINUTE = Number(process.env.RPC_RATE_LIMIT_PER_MINUTE || "120");
const RPC_RATE_LIMIT_BURST = Number(process.env.RPC_RATE_LIMIT_BURST || "40");
const RPC_RATE_WINDOW_MS = Number(process.env.RPC_RATE_WINDOW_MS || "60000");
const RPC_RATE_LIMIT_ALLOWLIST = (process.env.RPC_RATE_LIMIT_ALLOWLIST || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const RPC_CORS_ORIGINS = (process.env.RPC_CORS_ORIGINS || "http://localhost,http://127.0.0.1")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const RPC_ENABLE_GST_NAMESPACE = process.env.RPC_ENABLE_GST_NAMESPACE ? process.env.RPC_ENABLE_GST_NAMESPACE === "1" : true;
const RPC_DEPRECATE_ETH_NAMESPACE = process.env.RPC_DEPRECATE_ETH_NAMESPACE === "1";
const RPC_REJECT_ETH_NAMESPACE = process.env.RPC_REJECT_ETH_NAMESPACE === "1";

const RPC_ALIAS_AUDIT_LOG_URL = process.env.RPC_ALIAS_AUDIT_LOG_URL || "";
const RPC_ALIAS_AUDIT_LOG_TIMEOUT_MS = Number(process.env.RPC_ALIAS_AUDIT_LOG_TIMEOUT_MS || "750");

const checksumAccounts = new Map([
  ["0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"],
  ["0x70997970c51812dc3a010c7d01b50e0d17dc79c8", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"],
  ["0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"],
  ["0x90f79bf6eb2c4f870365e785982e1f101e93b906", "0x90F79bf6EB2c4f870365E785982E1f101E93b906"],
  ["0x15d34aaf54267db7d7c367839aaf71a00a2c6a65", "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"],
  ["0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc", "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"],
  ["0x976ea74026e726554db657fa54763abd0c3a0aa9", "0x976EA74026E726554dB657fA54763abd0C3a0aa9"],
  ["0x14dc79964da2c08b23698b3d3cc7ca32193d9955", "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955"],
  ["0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f", "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"],
  ["0xa0ee7a142d267c1f36714e4a8f75612f20a79720", "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"]
]);

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(obj));
}

function allowOrigin(origin) {
  if (!origin) return false;
  if (RPC_CORS_ORIGINS.includes("*")) return true;
  return RPC_CORS_ORIGINS.includes(origin);
}

function setCors(res, origin) {
  if (!origin) return;
  if (allowOrigin(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("access-control-allow-headers", "content-type,authorization,x-rpc-auth");
    res.setHeader("access-control-allow-methods", "POST,OPTIONS");
    res.setHeader("vary", "Origin");
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

function patchRequestPayload(payload) {
  const patchOne = (msg) => {
    if (!msg || typeof msg !== "object") return msg;
    if (msg.method === "eth_feeHistory" && Array.isArray(msg.params) && msg.params.length >= 3 && msg.params[2] == null) {
      msg.params = [msg.params[0], msg.params[1], []];
    }
    if (msg.method === "eth_estimateGas" && Array.isArray(msg.params) && msg.params.length >= 1) {
      const tx = msg.params[0];
      if (tx && typeof tx === "object" && "gas" in tx) {
        const g = tx.gas;
        const isZeroHex = typeof g === "string" && /^0x0*$/i.test(g);
        const isZeroNum = typeof g === "number" && g === 0;
        if (g == null || isZeroHex || isZeroNum) delete tx.gas;
      }
    }
    return msg;
  };

  if (Array.isArray(payload)) return payload.map((m) => patchOne(m));
  return patchOne(payload);
}

function describeRpcCall(method, params) {
  if (method !== "eth_call" || !Array.isArray(params) || !params.length) return "";
  const tx = params[0];
  if (!tx || typeof tx !== "object") return "";
  const to = typeof tx.to === "string" ? tx.to : "";
  const data = typeof tx.data === "string" ? tx.data : "";
  const sel = data.startsWith("0x") && data.length >= 10 ? data.slice(0, 10) : "";
  const extra = [to && `to=${to}`, sel && `sel=${sel}`].filter(Boolean).join(" ");
  return extra ? ` (${extra})` : "";
}

const rateState = new Map();
const metricState = {
  requests: 0,
  rateLimited: 0,
  authFailed: 0,
  aliasUsed: 0,
  aliasUsedByPair: new Map()
};

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function isAllowlisted(ip) {
  if (!ip) return false;
  if (RPC_RATE_LIMIT_ALLOWLIST.length === 0) return false;
  return RPC_RATE_LIMIT_ALLOWLIST.includes(ip);
}

function rateLimitOk(req) {
  if (RPC_RATE_LIMIT_PER_MINUTE <= 0) return true;
  const now = Date.now();
  const ip = getClientIp(req);
  if (isAllowlisted(ip)) return true;
  const entry = rateState.get(ip) || { count: 0, burst: 0, resetAt: now + RPC_RATE_WINDOW_MS, burstResetAt: now + 5000 };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RPC_RATE_WINDOW_MS;
  }
  if (now > entry.burstResetAt) {
    entry.burst = 0;
    entry.burstResetAt = now + 5000;
  }
  entry.count += 1;
  if (entry.count > RPC_RATE_LIMIT_PER_MINUTE) {
    entry.burst += 1;
    if (entry.burst > RPC_RATE_LIMIT_BURST) {
      rateState.set(ip, entry);
      return false;
    }
  }
  rateState.set(ip, entry);
  return true;
}

function methodRequiresAuth(method) {
  if (RPC_REQUIRE_AUTH) return true;
  if (!method) return false;
  return RPC_SENSITIVE_METHODS.some((prefix) => method.startsWith(prefix));
}

function hasAuth(req) {
  if (!RPC_AUTH_TOKEN) return true;
  const auth = req.headers.authorization || "";
  const token = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerToken = req.headers["x-rpc-auth"];
  return token === RPC_AUTH_TOKEN || headerToken === RPC_AUTH_TOKEN;
}

// GhostChain RPC namespace remap.
//
// Canonical: gst_*
// Compatibility alias: eth_*
//
// Note: Upstream execution clients (geth/op-geth) only implement eth_* today,
// so we map gst_* back to eth_* when forwarding upstream.
const METHOD_CANONICAL_MAP = new Map([
  ["eth_blockNumber", "gst_blockNumber"],
  ["eth_chainId", "gst_chainId"],
  ["eth_getBalance", "gst_getBalance"],
  ["eth_getTransactionCount", "gst_getTransactionCount"],
  ["eth_getBlockByNumber", "gst_getBlockByNumber"],
  ["eth_getBlockByHash", "gst_getBlockByHash"],
  ["eth_getCode", "gst_getCode"],
  ["eth_call", "gst_call"],
  ["eth_estimateGas", "gst_estimateGas"],
  ["eth_gasPrice", "gst_gasPrice"],
  ["eth_feeHistory", "gst_feeHistory"],
  ["eth_maxPriorityFeePerGas", "gst_maxPriorityFeePerGas"]
]);

const METHOD_UPSTREAM_MAP = new Map([
  ["gst_blockNumber", "eth_blockNumber"],
  ["gst_chainId", "eth_chainId"],
  ["gst_getBalance", "eth_getBalance"],
  ["gst_getTransactionCount", "eth_getTransactionCount"],
  ["gst_getBlockByNumber", "eth_getBlockByNumber"],
  ["gst_getBlockByHash", "eth_getBlockByHash"],
  ["gst_getCode", "eth_getCode"],
  ["gst_call", "eth_call"],
  ["gst_estimateGas", "eth_estimateGas"],
  ["gst_gasPrice", "eth_gasPrice"],
  ["gst_feeHistory", "eth_feeHistory"],
  ["gst_maxPriorityFeePerGas", "eth_maxPriorityFeePerGas"]
]);

function normalizeRpcMethod(method) {
  if (!method || typeof method !== "string") return { canonical: "", upstream: "", aliasFrom: "" };
  if (!RPC_ENABLE_GST_NAMESPACE) return { canonical: method, upstream: method, aliasFrom: "" };

  const canonical = METHOD_CANONICAL_MAP.get(method) || method;
  const upstream = METHOD_UPSTREAM_MAP.get(canonical) || canonical;
  const aliasFrom = method !== canonical ? method : "";
  return { canonical, upstream, aliasFrom };
}

async function postAuditLog(entry) {
  if (!RPC_ALIAS_AUDIT_LOG_URL) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_ALIAS_AUDIT_LOG_TIMEOUT_MS);
  try {
    await fetch(RPC_ALIAS_AUDIT_LOG_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry),
      signal: controller.signal
    });
  } catch {
    // best-effort
  } finally {
    clearTimeout(timeout);
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  setCors(res, origin);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true, upstream: UPSTREAM_URL });
  if (req.method === "GET" && req.url === "/metrics") {
    res.statusCode = 200;
    res.setHeader("content-type", "text/plain");
    const aliasByPairLines = [];
    for (const [key, count] of metricState.aliasUsedByPair.entries()) {
      const [from, to] = key.split("->");
      if (!from || !to) continue;
      aliasByPairLines.push(`ghost_rpc_proxy_alias_used_by_pair_total{from=\"${from}\",to=\"${to}\"} ${count}`);
    }
    return res.end(
      [
        `ghost_rpc_proxy_requests_total ${metricState.requests}`,
        `ghost_rpc_proxy_rate_limited_total ${metricState.rateLimited}`,
        `ghost_rpc_proxy_auth_failed_total ${metricState.authFailed}`,
        `ghost_rpc_proxy_alias_used_total ${metricState.aliasUsed}`,
        ...aliasByPairLines
      ].join("\n") + "\n"
    );
  }
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "POST only" });
  if (!rateLimitOk(req)) {
    metricState.rateLimited += 1;
    return json(res, 429, { ok: false, error: "rate_limited" });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, { ok: false, error: String(e?.message ?? e) });
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return json(res, 400, { ok: false, error: "invalid json" });
  }

  const methodById = new Map();
  const methods = [];
  const aliasEvents = [];
  let anyEthNamespaceUsed = false;
  if (Array.isArray(payload)) {
    for (const msg of payload) {
      if (msg && typeof msg === "object" && "id" in msg && "method" in msg) {
        methodById.set(msg.id, msg.method);
        methods.push(msg.method);
        if (typeof msg.method === "string" && msg.method.startsWith("eth_")) anyEthNamespaceUsed = true;
      }
    }
  } else if (payload && typeof payload === "object" && "id" in payload && "method" in payload) {
    methodById.set(payload.id, payload.method);
    methods.push(payload.method);
    if (typeof payload.method === "string" && payload.method.startsWith("eth_")) anyEthNamespaceUsed = true;
  }

  const needsAuth = methods.some((m) => methodRequiresAuth(m));
  if (needsAuth && !hasAuth(req)) {
    metricState.authFailed += 1;
    return json(res, 401, { ok: false, error: "auth_required" });
  }

  // Apply RPC namespace remaps (eth_* compatibility -> gst_* canonical) at the proxy boundary.
  const normalizeOne = (msg, clientIp) => {
    if (!msg || typeof msg !== "object" || typeof msg.method !== "string") return { msg, reject: false, canonical: "" };
    const { canonical, upstream, aliasFrom } = normalizeRpcMethod(msg.method);
    if (!canonical || !upstream) return { msg, reject: false, canonical: "" };
    if (RPC_REJECT_ETH_NAMESPACE && aliasFrom && aliasFrom.startsWith("eth_")) {
      return { msg, reject: true, canonical };
    }
    if (aliasFrom) {
      const ts = new Date().toISOString();
      aliasEvents.push({ ts, client: clientIp, from: aliasFrom, to: canonical, event: "rpc_alias_used" });
    }
    return { msg: { ...msg, method: upstream }, reject: false, canonical };
  };

  const clientIp = getClientIp(req);
  const normalizedMeta = Array.isArray(payload) ? payload.map((m) => normalizeOne(m, clientIp)) : [normalizeOne(payload, clientIp)];
  const normalized = Array.isArray(payload) ? normalizedMeta.map((m) => m.msg) : normalizedMeta[0].msg;

  // If configured, warn on legacy eth_* usage without breaking compatibility.
  if (RPC_DEPRECATE_ETH_NAMESPACE && anyEthNamespaceUsed) {
    res.setHeader("x-ghost-rpc-warning", "eth_* namespace deprecated; use gst_*");
  }

  // Hard reject eth_* namespace (opt-in) without touching upstream clients.
  if (RPC_REJECT_ETH_NAMESPACE) {
    const rejected = normalizedMeta.filter((m) => m.reject);
    if (rejected.length) {
      const errOne = (m) => ({
        jsonrpc: "2.0",
        id: m?.msg?.id ?? null,
        error: { code: -32000, message: `eth_* namespace rejected; use ${m?.canonical || "gst_*"}` }
      });
      return json(res, 200, Array.isArray(payload) ? rejected.map(errOne) : errOne(rejected[0]));
    }
  }

  if (LOG_REQUESTS && methods.length) {
    const uniq = [...new Set(methods)].join(",");
    // eslint-disable-next-line no-console
    console.log(`rpc-proxy -> ${uniq}`);
    for (const msg of Array.isArray(payload) ? payload : [payload]) {
      if (!msg || typeof msg !== "object" || !("method" in msg)) continue;
      const method = msg.method;
      const params = "params" in msg ? msg.params : undefined;
      // eslint-disable-next-line no-console
      console.log(`rpc-proxy call ${method}${describeRpcCall(method, params)}`);
    }
  }

  // Patch request payload after normalization.
  const patched = patchRequestPayload(normalized);

  if (aliasEvents.length) {
    metricState.aliasUsed += aliasEvents.length;
    for (const ev of aliasEvents) {
      const key = `${ev.from}->${ev.to}`;
      metricState.aliasUsedByPair.set(key, (metricState.aliasUsedByPair.get(key) || 0) + 1);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(ev));
      void postAuditLog(ev);
    }
  }

  let upstreamRes;
  try {
    upstreamRes = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patched)
    });
  } catch (e) {
    return json(res, 502, { ok: false, error: String(e?.message ?? e) });
  }

  const txt = await upstreamRes.text();
  let out = txt;
  const ct = upstreamRes.headers.get("content-type") || "application/json";
  if (ct.includes("application/json")) {
    try {
      const parsed = JSON.parse(txt);
      const patchResp = (r) => {
        const method = methodById.get(r?.id);
        if (method === "eth_accounts" && Array.isArray(r?.result)) {
          r.result = r.result.map((a) => checksumAccounts.get(String(a).toLowerCase()) ?? a);
        }
        return r;
      };
      out = JSON.stringify(Array.isArray(parsed) ? parsed.map(patchResp) : patchResp(parsed));
    } catch {
      // ignore
    }
  }

  metricState.requests += 1;
  res.statusCode = upstreamRes.status;
  res.setHeader("content-type", ct);
  res.end(out);
});

server.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`ghost-rpc-proxy listening on :${PORT} -> ${UPSTREAM_URL}`);
});
