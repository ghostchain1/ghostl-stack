import express from "express";
import fs from "node:fs";
import path from "node:path";
import { ghost } from "ghost";

const PORT = Number(process.env.PORT || 7701);
const STORE_PATH = process.env.AGENT_REGISTRY_STORE || path.join(process.cwd(), "data", "agent-registry.json");
const HEARTBEAT_PATH = process.env.AGENT_HEARTBEAT_STORE || path.join(process.cwd(), "data", "agent-heartbeats.json");
const POLICY_PATH = process.env.AGENT_POLICY_STORE || path.join(process.cwd(), "data", "agent-policy.json");
const WRITE_TOKEN = process.env.AGENT_REGISTRY_TOKEN || "";

const POLICY_RPC_URL = process.env.AGENT_POLICY_RPC_URL || process.env.RPC_URL || "";
const POLICY_CONTRACT = process.env.AGENT_POLICY_CONTRACT || "";
const REGISTRY_RPC_URL = process.env.AGENT_REGISTRY_RPC_URL || process.env.RPC_URL || "";
const REGISTRY_CONTRACT = process.env.AGENT_REGISTRY_CONTRACT || "";

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
app.use(express.json({ limit: "1mb" }));
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


const stableStringify = (value) => {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const readJson = (filePath, fallback) => {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
};

const hashOrBytes32 = (value) => {
  if (!value) return ghost.ZeroHash;
  if (typeof value === "string" && ghost.isHexString(value, 32)) return value;
  return ghost.keccak256(ghost.toUtf8Bytes(String(value)));
};

const buildPolicyClient = () => {
  if (!POLICY_RPC_URL || !POLICY_CONTRACT || !ghost.isAddress(POLICY_CONTRACT)) return null;
  const provider = new ghost.JsonRpcProvider(POLICY_RPC_URL);
  return new ghost.Contract(
    POLICY_CONTRACT,
    [
      "function isActionAllowed(bytes32 role,bytes32 action) view returns (bool)",
      "function rolePolicies(bytes32 role) view returns (bytes32 policyHash,bool enabled,uint64 updatedAt)"
    ],
    provider
  );
};

const policyClient = buildPolicyClient();

const buildRegistryClient = () => {
  if (!REGISTRY_RPC_URL || !REGISTRY_CONTRACT || !ghost.isAddress(REGISTRY_CONTRACT)) return null;
  const provider = new ghost.JsonRpcProvider(REGISTRY_RPC_URL);
  return new ghost.Contract(
    REGISTRY_CONTRACT,
    [
      "function agentCount() view returns (uint256)",
      "function agentAt(uint256) view returns (bytes32)",
      "function getAgent(bytes32) view returns (tuple(bytes32 role,address operator,bytes32 policyHash,string metadataURI,bool enabled,uint64 registeredAt,uint64 updatedAt,uint64 lastHeartbeat))"
    ],
    provider
  );
};

const registryClient = buildRegistryClient();

const fetchRolePoliciesFromChain = async (roles) => {
  if (!policyClient) return null;
  const results = {};
  for (const role of roles) {
    const roleHash = hashOrBytes32(role);
    try {
      const policy = await policyClient.rolePolicies(roleHash);
      results[role] = {
        roleHash,
        policyHash: policy.policyHash,
        enabled: policy.enabled,
        updatedAt: policy.updatedAt?.toString?.() ?? policy.updatedAt
      };
    } catch {
      results[role] = { roleHash, policyHash: null, enabled: false, updatedAt: null };
    }
  }
  return results;
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "agent-registry" }));

const toAgentRecord = (agentId, info, heartbeat) => ({
  agentId,
  ...info,
  heartbeat: heartbeat || null
});

const fetchAgentsFromChain = async () => {
  if (!registryClient) return null;
  const count = await registryClient.agentCount();
  const total = Number(count);
  const agents = [];
  for (let i = 0; i < total; i += 1) {
    const agentId = await registryClient.agentAt(i);
    const info = await registryClient.getAgent(agentId);
    agents.push({
      agentId,
      role: info.role,
      operator: info.operator,
      policyHash: info.policyHash,
      metadataURI: info.metadataURI,
      enabled: info.enabled,
      registeredAt: info.registeredAt?.toString?.() ?? info.registeredAt,
      updatedAt: info.updatedAt?.toString?.() ?? info.updatedAt,
      lastHeartbeat: info.lastHeartbeat?.toString?.() ?? info.lastHeartbeat
    });
  }
  return agents;
};

app.get("/agents", async (req, res) => {
  const source = String(req.query?.source || "local").toLowerCase();
  const registry = readJson(STORE_PATH, { agents: {} });
  const heartbeats = readJson(HEARTBEAT_PATH, { agents: {} });

  if (source === "chain") {
    try {
      const chainAgents = await fetchAgentsFromChain();
      if (!chainAgents) {
        res.status(400).json({ ok: false, error: "chain_registry_not_configured" });
        return;
      }
      res.json({ ok: true, agents: chainAgents });
      return;
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
      return;
    }
  }

  const localAgents = Object.entries(registry.agents || {}).map(([agentId, info]) =>
    toAgentRecord(agentId, info, heartbeats.agents?.[agentId] || null)
  );

  if (source === "merged") {
    try {
      const chainAgents = await fetchAgentsFromChain();
      if (chainAgents) {
        const byId = new Map(chainAgents.map((agent) => [String(agent.agentId), agent]));
        for (const agent of localAgents) {
          byId.set(String(agent.agentId), agent);
        }
        res.json({ ok: true, agents: Array.from(byId.values()) });
        return;
      }
    } catch {
      // fall back to local
    }
  }

  res.json({ ok: true, agents: localAgents });
});

/** GET /agents/stats — local registry counts by role */
app.get("/agents/stats", (_req, res) => {
  const registry = readJson(STORE_PATH, { agents: {} });
  const heartbeats = readJson(HEARTBEAT_PATH, { agents: {} });
  const agents = Object.values(registry.agents || {});
  const byRole = {};
  for (const a of agents) { const r = a.role || "unknown"; byRole[r] = (byRole[r] || 0) + 1; }
  const activeHeartbeats = Object.keys(heartbeats.agents || {}).length;
  res.json({ ok: true, stats: { total: agents.length, byRole, activeHeartbeats, fetchedAt: new Date().toISOString() } });
});

app.post("/agents/register", (req, res) => {
  if (WRITE_TOKEN && req.header("x-registry-token") !== WRITE_TOKEN) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  const { agentId, role, metadata = {}, policyHash } = req.body || {};
  if (!agentId || !role) {
    res.status(400).json({ ok: false, error: "agentId and role required" });
    return;
  }
  const registry = readJson(STORE_PATH, { agents: {} });
  registry.agents[agentId] = {
    role,
    metadata,
    policyHash: policyHash || null,
    registeredAt: new Date().toISOString()
  };
  writeJson(STORE_PATH, registry);
  res.json({ ok: true, agentId });
});

app.post("/agents/heartbeat", (req, res) => {
  const { agentId, role, status = "ok", info = {} } = req.body || {};
  if (!agentId) {
    res.status(400).json({ ok: false, error: "agentId required" });
    return;
  }
  const heartbeats = readJson(HEARTBEAT_PATH, { agents: {} });
  heartbeats.agents[agentId] = {
    role,
    status,
    info,
    lastSeen: new Date().toISOString()
  };
  writeJson(HEARTBEAT_PATH, heartbeats);
  res.json({ ok: true });
});

app.post("/policy/check", async (req, res) => {
  const { role, action } = req.body || {};
  if (!role || !action) {
    res.status(400).json({ ok: false, error: "role and action required" });
    return;
  }
  const roleHash = hashOrBytes32(role);
  const actionHash = hashOrBytes32(action);

  if (policyClient) {
    try {
      const allowed = await policyClient.isActionAllowed(roleHash, actionHash);
      res.json({ ok: true, allowed, roleHash, actionHash, source: "chain" });
      return;
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
      return;
    }
  }

  const policy = readJson(POLICY_PATH, { roles: {} });
  const allowed = Boolean(policy.roles?.[role]?.actions?.includes(action));
  res.json({ ok: true, allowed, roleHash, actionHash, source: "local" });
});

app.get("/policy", async (_req, res) => {
  if (policyClient) {
    res.json({ ok: true, source: "chain", contract: POLICY_CONTRACT });
    return;
  }
  const policy = readJson(POLICY_PATH, { roles: {} });
  res.json({ ok: true, source: "local", policy });
});

app.get("/policy/cache", async (req, res) => {
  if (!policyClient) {
    res.status(400).json({ ok: false, error: "policy_contract_not_configured" });
    return;
  }

  const source = String(req.query?.source || "auto").toLowerCase();
  let roleSource = "local";
  let roles = [];

  if (source !== "local" && registryClient) {
    try {
      const chainAgents = await fetchAgentsFromChain();
      if (chainAgents && chainAgents.length > 0) {
        roles = Array.from(new Set(chainAgents.map((agent) => agent.role).filter(Boolean)));
        roleSource = "chain";
      }
    } catch {
      // fall back to local roles
    }
  }

  if (roles.length === 0) {
    const registry = readJson(STORE_PATH, { agents: {} });
    roles = Array.from(new Set(Object.values(registry.agents || {}).map((agent) => agent.role).filter(Boolean)));
    roleSource = "local";
  }
  if (roles.length === 0) {
    res.json({ ok: true, cached: false, roles: [], policy: {}, roleSource });
    return;
  }

  try {
    const policyData = await fetchRolePoliciesFromChain(roles);
    const policy = readJson(POLICY_PATH, { roles: {} });
    policy.roles = policy.roles || {};
    for (const [role, info] of Object.entries(policyData || {})) {
      policy.roles[role] = {
        policyHash: info.policyHash,
        enabled: info.enabled,
        updatedAt: info.updatedAt
      };
    }
    writeJson(POLICY_PATH, policy);
    res.json({ ok: true, cached: true, roles, policy, roleSource });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

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

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[agent-registry] listening on :${PORT}`);
  console.log(`[agent-registry] policy source: ${policyClient ? "chain" : "local"}`);
  console.log(`[agent-registry] registry source: ${registryClient ? "chain" : "local"}`);
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
process.on("SIGTERM", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGQUIT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
