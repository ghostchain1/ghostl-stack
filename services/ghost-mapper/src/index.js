import express from "express";
import net from "node:net";
import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";

const SERVICE_NAME = process.env.SERVICE_NAME || "ghost-mapper";
const PORT = Number(process.env.PORT || 7780);

const EXECUTION_ENABLED = process.env.MAPPER_EXECUTION_ENABLED === "true";
const ADMIN_TOKEN = process.env.MAPPER_ADMIN_TOKEN || "";
const PERSIST_ENABLED = process.env.MAPPER_PERSIST_ENABLED !== "false";

const CONFIG_PATH = process.env.MAPPER_CONFIG_PATH || path.join(process.cwd(), "data", "mappings.json");

const BIND_ADDRESS = process.env.MAPPER_BIND_ADDRESS || "0.0.0.0";
const CONNECT_TIMEOUT_MS = Math.max(250, Number(process.env.MAPPER_CONNECT_TIMEOUT_MS || 5000));
const IDLE_TIMEOUT_MS = Math.max(1_000, Number(process.env.MAPPER_IDLE_TIMEOUT_MS || 300_000));
const MAX_ACTIVE_MAPPINGS = Math.max(1, Number(process.env.MAPPER_MAX_ACTIVE_MAPPINGS || 100));
const ALLOW_LOW_PORTS = process.env.MAPPER_ALLOW_LOW_PORTS === "true";

const LOG_REQUESTS = process.env.LOG_REQUESTS === "1";
const LOG_CONNECTIONS = process.env.LOG_CONNECTIONS === "1";

const logEvent = (level, event, data) => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    service: SERVICE_NAME,
    ...(data || {})
  };
  console.log(JSON.stringify(payload));
};

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
};

const normalizeHost = (value) => {
  if (!value) return "";
  const host = String(value).trim();
  if (!host) return "";
  return host;
};

const normalizePort = (value) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("invalid_port");
  }
  if (!ALLOW_LOW_PORTS && port < 1024) {
    throw new Error("listen_port_requires_root");
  }
  return port;
};

const nowIso = () => new Date().toISOString();

const mappingId = () => crypto.randomUUID();

const stableStringify = (value) => {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const specHash = (spec) => crypto.createHash("sha256").update(stableStringify(spec)).digest("hex");

const readJsonFile = async (filePath) => {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
};

const writeJsonFile = async (filePath, data) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
};

const DEFAULT_CONFIG = {
  version: 1,
  mappings: []
};

const coerceMapping = (input) => {
  const protocol = String(input?.protocol || "tcp").toLowerCase();
  if (protocol !== "tcp") throw new Error("unsupported_protocol");

  const listenPort = input?.listen?.port ?? input?.listenPort ?? input?.port;
  const listenHost = normalizeHost(input?.listen?.host ?? input?.listenHost ?? input?.bind ?? input?.host) || BIND_ADDRESS;
  const targetPort = input?.target?.port ?? input?.targetPort;
  const targetHost = normalizeHost(input?.target?.host ?? input?.targetHost);

  if (!targetHost) throw new Error("target_host_required");

  const id = String(input?.id || input?.mappingId || "").trim() || mappingId();
  const name = String(input?.name || "").trim() || id;
  const enabled = input?.enabled === undefined ? true : parseBool(input.enabled, true);
  const notes = String(input?.notes || "").trim();

  const mapping = {
    id,
    name,
    enabled,
    protocol,
    listen: {
      host: listenHost,
      port: normalizePort(listenPort)
    },
    target: {
      host: targetHost,
      port: normalizePort(targetPort)
    },
    notes
  };

  return mapping;
};

const coerceConfig = (input) => {
  if (!input || typeof input !== "object") return DEFAULT_CONFIG;
  const version = Number(input.version || 1);
  if (version !== 1) throw new Error("unsupported_config_version");

  const mappings = Array.isArray(input.mappings) ? input.mappings : [];
  const coerced = mappings.map((entry) => coerceMapping(entry));

  const seen = new Set();
  for (const mapping of coerced) {
    if (seen.has(mapping.id)) throw new Error("duplicate_mapping_id");
    seen.add(mapping.id);
  }

  return { version, mappings: coerced };
};

const runtime = {
  startedAt: Date.now(),
  lastReloadAt: null,
  errors: []
};

const activeMappings = new Map(); // id -> { spec, specHash, server, createdAt, lastError, stats }

const createProxyServer = (spec, stats) => {
  const server = net.createServer({ allowHalfOpen: false }, (clientSocket) => {
    stats.connectionsTotal += 1;
    stats.activeConnections += 1;

    let connectionCounted = true;
    const decrementConnectionsOnce = () => {
      if (!connectionCounted) return;
      connectionCounted = false;
      stats.activeConnections = Math.max(0, stats.activeConnections - 1);
    };

    clientSocket.setTimeout(IDLE_TIMEOUT_MS, () => clientSocket.destroy());
    clientSocket.setNoDelay(true);

    const upstream = net.connect({ host: spec.target.host, port: spec.target.port });

    let connectTimer = setTimeout(() => {
      upstream.destroy(new Error("connect_timeout"));
      clientSocket.destroy();
    }, CONNECT_TIMEOUT_MS);

    const clearConnectTimer = () => {
      if (!connectTimer) return;
      clearTimeout(connectTimer);
      connectTimer = null;
    };

    upstream.once("connect", clearConnectTimer);
    upstream.once("close", clearConnectTimer);
    upstream.once("error", clearConnectTimer);
    upstream.setTimeout(IDLE_TIMEOUT_MS, () => upstream.destroy());
    upstream.setNoDelay(true);

    const onBytesIn = (chunk) => {
      stats.bytesIn += chunk.length;
    };
    const onBytesOut = (chunk) => {
      stats.bytesOut += chunk.length;
    };

    clientSocket.on("data", onBytesIn);
    upstream.on("data", onBytesOut);

    const closeBoth = () => {
      clientSocket.destroy();
      upstream.destroy();
    };

    clientSocket.once("error", (err) => {
      stats.lastError = err?.message || String(err);
      if (LOG_CONNECTIONS) {
        logEvent("warn", "proxy_client_error", { mappingId: spec.id, error: stats.lastError });
      }
      closeBoth();
    });
    upstream.once("error", (err) => {
      stats.lastError = err?.message || String(err);
      if (LOG_CONNECTIONS) {
        logEvent("warn", "proxy_upstream_error", { mappingId: spec.id, error: stats.lastError });
      }
      closeBoth();
    });

    clientSocket.once("close", decrementConnectionsOnce);
    upstream.once("close", decrementConnectionsOnce);

    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
  });

  return server;
};

const stopMapping = async (id) => {
  const entry = activeMappings.get(id);
  if (!entry) return;

  await new Promise((resolve) => entry.server.close(resolve));
  activeMappings.delete(id);
  logEvent("info", "mapping_stopped", { mappingId: id });
};

const startMapping = async (spec) => {
  if (activeMappings.has(spec.id)) return;
  if (activeMappings.size >= MAX_ACTIVE_MAPPINGS) throw new Error("max_active_mappings_reached");

  const stats = {
    connectionsTotal: 0,
    activeConnections: 0,
    bytesIn: 0,
    bytesOut: 0,
    lastError: null
  };

  const server = createProxyServer(spec, stats);
  const desiredHash = specHash(spec);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(spec.listen.port, spec.listen.host, resolve);
  });

  activeMappings.set(spec.id, {
    spec,
    specHash: desiredHash,
    server,
    createdAt: nowIso(),
    lastError: null,
    stats
  });

  logEvent("info", "mapping_started", {
    mappingId: spec.id,
    listen: spec.listen,
    target: spec.target
  });
};

const reconcileMappings = async (desiredConfig) => {
  const desired = new Map();
  for (const mapping of desiredConfig.mappings) {
    if (mapping.enabled === false) continue;
    desired.set(mapping.id, mapping);
  }

  const toStop = [];
  for (const [id, entry] of activeMappings.entries()) {
    const desiredSpec = desired.get(id);
    if (!desiredSpec) {
      toStop.push(id);
      continue;
    }
    const desiredHash = specHash(desiredSpec);
    if (entry.specHash !== desiredHash) {
      toStop.push(id);
    }
  }

  for (const id of toStop) {
    await stopMapping(id);
  }

  for (const spec of desired.values()) {
    if (activeMappings.has(spec.id)) continue;
    try {
      await startMapping(spec);
    } catch (err) {
      const msg = err?.message || String(err);
      runtime.errors.push({ ts: nowIso(), mappingId: spec.id, error: msg });
      logEvent("error", "mapping_start_failed", { mappingId: spec.id, error: msg });
    }
  }
};

let currentConfig = DEFAULT_CONFIG;

const loadConfig = async () => {
  try {
    const parsed = await readJsonFile(CONFIG_PATH);
    currentConfig = coerceConfig(parsed);
  } catch (err) {
    if (err?.code === "ENOENT") {
      currentConfig = DEFAULT_CONFIG;
    } else {
      runtime.errors.push({ ts: nowIso(), error: err?.message || String(err), source: "config_load" });
      currentConfig = DEFAULT_CONFIG;
    }
  }
  runtime.lastReloadAt = Date.now();
  await reconcileMappings(currentConfig);
  return currentConfig;
};

const persistConfig = async () => {
  if (!PERSIST_ENABLED) return;
  await writeJsonFile(CONFIG_PATH, currentConfig);
};

const requireAdmin = (req, res) => {
  if (!EXECUTION_ENABLED) {
    res.status(403).json({ ok: false, error: "execution_disabled" });
    return false;
  }
  if (!ADMIN_TOKEN) {
    res.status(500).json({ ok: false, error: "admin_token_not_configured" });
    return false;
  }
  const token = req.header("x-admin-token") || "";
  if (token !== ADMIN_TOKEN) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return false;
  }
  return true;
};

const toPublicMapping = (spec) => {
  const runtimeEntry = activeMappings.get(spec.id);
  return {
    ...spec,
    status: runtimeEntry ? "active" : spec.enabled === false ? "disabled" : "inactive",
    runtime: runtimeEntry
      ? {
          createdAt: runtimeEntry.createdAt,
          stats: runtimeEntry.stats
        }
      : null
  };
};

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.set("json spaces", 0);
app.set("query parser", "simple");
app.set("strict routing", true);
app.set("case sensitive routing", true);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");
  next();
});
const _CORS_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && _CORS_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const _RL_WINDOW = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const _RL_MAX    = Number(process.env.RATE_LIMIT_MAX ?? 1000);
const _rlStore   = new Map();
setInterval(() => _rlStore.clear(), _RL_WINDOW).unref();
app.use((req, res, next) => {
  const key = req.ip ?? "unknown";
  const count = (_rlStore.get(key) ?? 0) + 1;
  _rlStore.set(key, count);
  res.setHeader("X-RateLimit-Limit", _RL_MAX);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, _RL_MAX - count));
  res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + _RL_WINDOW) / 1000));
  if (count > _RL_MAX) { res.setHeader("Retry-After", Math.ceil(_RL_WINDOW / 1000)); res.setHeader("RateLimit-Policy", `limit=${_RL_MAX};w=${Math.ceil(_RL_WINDOW / 1000)}`); return res.status(429).json({ error: "Too many requests" }); }
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, parameterLimit: 100 }));
app.use((req, res, next) => {
  if (["POST","PUT","PATCH"].includes(req.method) && req.headers["content-type"] &&
      !req.is(["application/json","application/x-www-form-urlencoded"])) {
    return res.status(415).json({ ok: false, error: "Unsupported Media Type" });
  }
  next();
});
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); res.setHeader("Retry-After", "5"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("prefinish", () => res.setHeader("X-Response-Time", `${Date.now() - t0}ms`));
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


if (LOG_REQUESTS) {
  app.use((req, _res, next) => {
    logEvent("info", "http_request", { method: req.method, path: req.path });
    next();
  });
}

app.get("/health", (_req, res) => {
  const inactive = currentConfig.mappings.filter((m) => m.enabled !== false && !activeMappings.has(m.id)).map((m) => m.id);
  res.json({
    ok: true,
    service: SERVICE_NAME,
    startedAt: new Date(runtime.startedAt).toISOString(),
    mappings: {
      configured: currentConfig.mappings.length,
      active: activeMappings.size,
      inactive
    }
  });
});

app.get("/mappings", (_req, res) => {
  res.json({ ok: true, mappings: currentConfig.mappings.map((m) => toPublicMapping(m)) });
});

app.get("/config", (_req, res) => {
  res.json({ ok: true, config: currentConfig, configPath: CONFIG_PATH, persistEnabled: PERSIST_ENABLED });
});

app.post("/reload", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const next = await loadConfig();
    res.json({ ok: true, config: next });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

app.post("/mappings", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const mapping = coerceMapping(req.body || {});
    if (currentConfig.mappings.some((m) => m.id === mapping.id)) throw new Error("mapping_id_exists");
    currentConfig = { ...currentConfig, mappings: [...currentConfig.mappings, mapping] };
    await reconcileMappings(currentConfig);
    await persistConfig();
    res.status(201).json({ ok: true, mapping: toPublicMapping(mapping) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || String(err) });
  }
});

/** GET /stats — mapping runtime summary */
app.get("/stats", (_req, res) => {
  const uptimeSec = Math.floor((Date.now() - runtime.startedAt) / 1000);
  const configured = currentConfig.mappings.length;
  const active = activeMappings.size;
  res.json({ ok: true, stats: { configured, active, inactive: configured - active, uptimeSec, startedAt: new Date(runtime.startedAt).toISOString(), fetchedAt: new Date().toISOString() } });
});

app.delete("/mappings/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json({ ok: false, error: "id_required" });
    return;
  }
  try {
    const nextMappings = currentConfig.mappings.filter((m) => m.id !== id);
    if (nextMappings.length === currentConfig.mappings.length) {
      res.status(404).json({ ok: false, error: "mapping_not_found" });
      return;
    }
    currentConfig = { ...currentConfig, mappings: nextMappings };
    await stopMapping(id);
    await persistConfig();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

const shutdown = async () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  const ids = Array.from(activeMappings.keys());
  for (const id of ids) {
    try {
      await stopMapping(id);
    } catch (err) {
      logEvent("warn", "mapping_stop_failed", { mappingId: id, error: err?.message || String(err) });
    }
  }
  server.closeAllConnections();
  process.exit(0);
};

process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("exit", (code) => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "exit", code })); });
process.on("SIGPIPE", () => { /* ignore: client disconnected mid-response */ });
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err), stack: err?.stack }));
  process.exitCode = 1; process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason), stack: reason?.stack }));
  process.exitCode = 1; process.exit(1);
});
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGQUIT", shutdown);

app.use((_req, res) => { res.setHeader("Cache-Control", "no-store"); return res.status(404).json({ ok: false, error: "not_found" }); });

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  if (err.status === 413 || err.statusCode === 413) return res.status(413).json({ ok: false, error: "Payload too large" });
  if (err.status === 431 || err.statusCode === 431) return res.status(431).json({ ok: false, error: "Request header fields too large" });
  if (err.status === 408 || err.statusCode === 408) return res.status(408).json({ ok: false, error: "Request timeout" });
  if (err.status === 405 || err.statusCode === 405) return res.status(405).json({ ok: false, error: "Method not allowed" });
  const status = err.status ?? err.statusCode ?? 500;
  const _isProd = process.env.NODE_ENV === "production";
  res.setHeader("Cache-Control", "no-store");
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledError", status, error: err?.message ?? String(err), stack: _isProd ? undefined : err?.stack }));
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

await loadConfig();
const server = app.listen(PORT, "0.0.0.0", () => {
  logEvent("info", "listening", { port: PORT });
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
server.on("connection", (socket) => socket.setNoDelay(true));
server.on("error", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "serverError", error: err?.message ?? String(err), code: err?.code }));
  if (err.code === "EADDRINUSE" || err.code === "EACCES") { process.exitCode = 1; process.exit(1); }
});
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown" }));
