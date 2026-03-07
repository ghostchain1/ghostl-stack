import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const PORT = Number(process.env.PORT || 7710);
const VAULT_ADDR = process.env.VAULT_ADDR || "http://localhost:8200";
const VAULT_NAMESPACE = process.env.VAULT_NAMESPACE || "";
const VAULT_TOKEN = process.env.VAULT_TOKEN || "";
const VAULT_ROLE_ID = process.env.VAULT_ROLE_ID || "";
const VAULT_SECRET_ID = process.env.VAULT_SECRET_ID || "";
const FORWARD_CLIENT_TOKEN = process.env.AI_VAULT_FORWARD_CLIENT_TOKEN === "1";
const SERVICES_ROOT = process.env.SERVICES_ROOT || "/services";
const SERVICES_MOUNT = "/services";

const POLICY_PATH = process.env.AI_VAULT_POLICY_PATH || path.resolve(process.cwd(), "policy.example.json");
const POLICY_WRITE = process.env.AI_VAULT_POLICY_WRITE === "1";
const EXECUTE_ACTIONS = process.env.AI_VAULT_EXECUTE === "1";
const DEFAULT_DECISION = (process.env.AI_VAULT_DEFAULT_DECISION || "deny").toLowerCase();

const RATE_WINDOW_MS = Number(process.env.AI_VAULT_RATE_WINDOW_MS || 60_000);
const RATE_LIMIT = Number(process.env.AI_VAULT_RATE_LIMIT || 120);
const BURST_LIMIT = Number(process.env.AI_VAULT_BURST_LIMIT || 40);
const BLOCK_MS = Number(process.env.AI_VAULT_BLOCK_MS || 300_000);
const ROTATE_INTERVAL_MS = Number(process.env.AI_VAULT_ROTATE_INTERVAL_MS || 900_000);

const app = express();
app.use(express.json({ limit: "1mb" }));

let policy = {
  allow: [],
  deny: [],
  rotate: [],
  anomaly: { rateLimitPerMinute: RATE_LIMIT, burst: BURST_LIMIT, blockMs: BLOCK_MS }
};

const state = {
  token: VAULT_TOKEN || "",
  lastLogin: 0,
  blocked: new Map(),
  accessLog: [],
  anomalies: [],
  metrics: {
    requests: 0,
    denied: 0,
    allowed: 0,
    anomalies: 0,
    rotations: 0,
    rotationFails: 0
  }
};

const loadPolicy = () => {
  try {
    const raw = fs.readFileSync(POLICY_PATH, "utf8");
    policy = JSON.parse(raw);
  } catch (err) {
    console.warn(`[ai-vault] policy load failed: ${err?.message || err}`);
  }
};

const savePolicy = () => {
  if (!POLICY_WRITE) return;
  fs.writeFileSync(POLICY_PATH, JSON.stringify(policy, null, 2));
};

loadPolicy();

const recordEvent = (evt) => {
  state.accessLog.push({ ts: Date.now(), ...evt });
  if (state.accessLog.length > 1000) state.accessLog.shift();
};

const hashActor = (token, ip) => {
  return crypto.createHash("sha256").update(`${token || ""}:${ip || ""}`).digest("hex").slice(0, 16);
};

const getActorId = (req) => {
  return req.headers["x-actor-id"] || hashActor(req.headers["x-vault-token"], req.ip);
};

const matchRule = (rule, reqPath, method) => {
  if (rule.methods && !rule.methods.includes(method)) return false;
  if (rule.path && rule.path === reqPath) return true;
  if (rule.pathPrefix && reqPath.startsWith(rule.pathPrefix)) return true;
  return false;
};

const decide = (reqPath, method, actorId) => {
  const now = Date.now();
  const blockedUntil = state.blocked.get(actorId) || 0;
  if (blockedUntil > now) return { decision: "deny", reason: "blocked" };

  for (const rule of policy.deny || []) {
    if (matchRule(rule, reqPath, method)) return { decision: "deny", reason: "policy_deny" };
  }

  for (const rule of policy.allow || []) {
    if (matchRule(rule, reqPath, method)) return { decision: "allow", reason: "policy_allow" };
  }

  return { decision: DEFAULT_DECISION, reason: "default" };
};

const detectAnomaly = (actorId) => {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  const recent = state.accessLog.filter((e) => e.actorId === actorId && e.ts >= windowStart);
  const burst = recent.filter((e) => e.ts >= now - 5_000);
  const limit = policy.anomaly?.rateLimitPerMinute || RATE_LIMIT;
  const burstLimit = policy.anomaly?.burst || BURST_LIMIT;
  if (recent.length > limit || burst.length > burstLimit) {
    return { recent: recent.length, burst: burst.length, limit, burstLimit };
  }
  return null;
};

const maybeBlock = (actorId, anomaly) => {
  state.metrics.anomalies += 1;
  const until = Date.now() + (policy.anomaly?.blockMs || BLOCK_MS);
  state.blocked.set(actorId, until);
  state.anomalies.push({ ts: Date.now(), actorId, anomaly, blockedUntil: until });
  if (state.anomalies.length > 500) state.anomalies.shift();
};

const vaultFetch = async (method, vaultPath, body, tokenOverride) => {
  const url = `${VAULT_ADDR}${vaultPath.startsWith("/v1") ? vaultPath : `/v1/${vaultPath.replace(/^\//, "")}`}`;
  const headers = { "content-type": "application/json" };
  const token = tokenOverride || state.token;
  if (token) headers["x-vault-token"] = token;
  if (VAULT_NAMESPACE) headers["x-vault-namespace"] = VAULT_NAMESPACE;
  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000)
  });
  const text = await resp.text();
  if (!resp.ok) {
    const err = new Error(`vault ${resp.status}: ${text.slice(0, 300)}`);
    err.status = resp.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
};

const loginAppRole = async () => {
  if (!VAULT_ROLE_ID || !VAULT_SECRET_ID) return;
  const resp = await vaultFetch("POST", "/v1/auth/approle/login", {
    role_id: VAULT_ROLE_ID,
    secret_id: VAULT_SECRET_ID
  });
  const token = resp?.auth?.client_token;
  if (token) {
    state.token = token;
    state.lastLogin = Date.now();
    console.log("[ai-vault] logged in via AppRole");
  }
};

const ensureToken = async () => {
  if (state.token) return;
  await loginAppRole();
};

const kvRead = async (mount, secretPath, version = 2) => {
  const v2Path = `/v1/${mount}/data/${secretPath.replace(/^\//, "")}`;
  const v1Path = `/v1/${mount}/${secretPath.replace(/^\//, "")}`;
  return vaultFetch("GET", version === 2 ? v2Path : v1Path);
};

const kvWrite = async (mount, secretPath, data, version = 2) => {
  const v2Path = `/v1/${mount}/data/${secretPath.replace(/^\//, "")}`;
  const v1Path = `/v1/${mount}/${secretPath.replace(/^\//, "")}`;
  const body = version === 2 ? { data } : data;
  return vaultFetch("POST", version === 2 ? v2Path : v1Path, body);
};

const rotateRule = async (rule) => {
  if (!EXECUTE_ACTIONS) return { ok: false, reason: "execute_disabled" };
  const mount = rule.mount || "secret";
  const secretPath = rule.path || "";
  if (!secretPath) return { ok: false, reason: "missing_path" };
  const version = rule.kvVersion || 2;
  const resp = await kvRead(mount, secretPath, version);
  const current = version === 2 ? resp?.data?.data || {} : resp?.data || {};
  const updated = { ...current };
  const keys = rule.keys || Object.keys(current);
  for (const key of keys) {
    const len = rule.keyLength || 32;
    const buf = crypto.randomBytes(len);
    updated[key] = rule.encoding === "hex" ? buf.toString("hex") : buf.toString("base64");
  }
  await kvWrite(mount, secretPath, updated, version);
  return { ok: true, rotated: keys };
};

const rotationLoop = async () => {
  if (!policy.rotate || policy.rotate.length === 0) return;
  for (const rule of policy.rotate) {
    const last = rule._lastRotated || 0;
    const intervalMs = (rule.intervalMinutes || 60) * 60_000;
    if (Date.now() - last < intervalMs) continue;
    try {
      await ensureToken();
      const result = await rotateRule(rule);
      if (result.ok) {
        rule._lastRotated = Date.now();
        state.metrics.rotations += 1;
        recordEvent({ type: "rotation", rule: rule.path, rotated: result.rotated });
      } else {
        state.metrics.rotationFails += 1;
        recordEvent({ type: "rotation_skip", rule: rule.path, reason: result.reason });
      }
    } catch (err) {
      state.metrics.rotationFails += 1;
      recordEvent({ type: "rotation_error", rule: rule.path, error: err?.message || String(err) });
    }
  }
  savePolicy();
};

setInterval(rotationLoop, ROTATE_INTERVAL_MS);

app.get("/health", (_req, res) => res.json({ ok: true, service: "ai-vault" }));

app.get("/status", (_req, res) => {
  const servicesRootExists = fs.existsSync(SERVICES_ROOT);
  const servicesMountExists = fs.existsSync(SERVICES_MOUNT);
  const servicesRootResolved = servicesRootExists ? SERVICES_ROOT : (servicesMountExists ? SERVICES_MOUNT : SERVICES_ROOT);
  res.json({
    ok: true,
    execute: EXECUTE_ACTIONS,
    policyPath: POLICY_PATH,
    defaultDecision: DEFAULT_DECISION,
    blocked: state.blocked.size,
    servicesRoot: SERVICES_ROOT,
    servicesRootExists,
    servicesMount: SERVICES_MOUNT,
    servicesMountExists,
    servicesRootResolved
  });
});

app.get("/policy", (_req, res) => res.json({ ok: true, policy }));
app.put("/policy", (req, res) => {
  policy = req.body || policy;
  savePolicy();
  res.json({ ok: true, policy });
});

app.get("/events", (_req, res) => res.json({ ok: true, events: state.accessLog.slice(-200) }));
app.get("/anomalies", (_req, res) => res.json({ ok: true, anomalies: state.anomalies.slice(-200) }));

app.post("/rotate", async (req, res) => {
  try {
    await ensureToken();
    const rule = req.body || {};
    const result = await rotateRule(rule);
    res.json({ ok: result.ok, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

app.get("/metrics", (_req, res) => {
  const servicesRootExists = fs.existsSync(SERVICES_ROOT) ? 1 : 0;
  const servicesMountExists = fs.existsSync(SERVICES_MOUNT) ? 1 : 0;
  const servicesRootResolved = servicesRootExists ? SERVICES_ROOT : (servicesMountExists ? SERVICES_MOUNT : SERVICES_ROOT);
  res.type("text/plain").send([
    `ai_vault_requests_total ${state.metrics.requests}`,
    `ai_vault_requests_denied_total ${state.metrics.denied}`,
    `ai_vault_requests_allowed_total ${state.metrics.allowed}`,
    `ai_vault_anomalies_total ${state.metrics.anomalies}`,
    `ai_vault_rotations_total ${state.metrics.rotations}`,
    `ai_vault_rotation_failures_total ${state.metrics.rotationFails}`,
    `ai_vault_services_root_exists ${servicesRootExists}`,
    `ai_vault_services_mount_exists ${servicesMountExists}`,
    `ai_vault_services_root_resolved{path="${servicesRootResolved}"} 1`
  ].join("\n"));
});

app.all(/^\/v1\/.*/, async (req, res) => {
  const reqPath = req.originalUrl.split("?")[0];
  const actorId = getActorId(req);
  const decision = decide(reqPath, req.method, actorId);
  state.metrics.requests += 1;
  recordEvent({ type: "request", actorId, path: reqPath, method: req.method, decision: decision.decision });

  const anomaly = detectAnomaly(actorId);
  if (anomaly) {
    maybeBlock(actorId, anomaly);
  }

  if (decision.decision !== "allow") {
    state.metrics.denied += 1;
    return res.status(403).json({ ok: false, blocked: true, reason: decision.reason });
  }

  try {
    await ensureToken();
    const tokenOverride = FORWARD_CLIENT_TOKEN ? req.headers["x-vault-token"] : undefined;
    const body = Object.keys(req.body || {}).length ? req.body : undefined;
    const vaultResp = await vaultFetch(req.method, reqPath, body, tokenOverride);
    state.metrics.allowed += 1;
    res.json(vaultResp);
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err?.message || String(err) });
  }
});

const server = app.listen(PORT, () => {
  const servicesRootExists = fs.existsSync(SERVICES_ROOT);
  const servicesMountExists = fs.existsSync(SERVICES_MOUNT);
  const servicesRootResolved = servicesRootExists ? SERVICES_ROOT : (servicesMountExists ? SERVICES_MOUNT : SERVICES_ROOT);
  console.log(
    `[ai-vault] listening on :${PORT}, vault=${VAULT_ADDR}, execute=${EXECUTE_ACTIONS}, servicesRoot=${SERVICES_ROOT}, servicesRootExists=${servicesRootExists}, servicesMount=${SERVICES_MOUNT}, servicesMountExists=${servicesMountExists}, servicesRootResolved=${servicesRootResolved}`
  );
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
