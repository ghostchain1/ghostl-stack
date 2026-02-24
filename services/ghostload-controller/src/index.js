import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadPolicy,
  validatePolicy,
  validateDecision,
  classifyChange
} from "../../../packages/ghostload-policy/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 7689);
const KILL_SWITCH = process.env.GHOSTLOAD_KILL_SWITCH === "1";
const MANUAL_ONLY = process.env.GHOSTLOAD_MANUAL_ONLY === "1";
const AUDIT_SIGNING_KEY = process.env.GHOSTLOAD_AUDIT_SIGNING_KEY || "ghostload-dev-audit-key";
const POLICY_PATH = process.env.GHOSTLOAD_POLICY_PATH || path.join(__dirname, "..", "..", "..", "packages", "ghostload-policy", "default-policy.json");
const STATE_DIR = process.env.GHOSTLOAD_STATE_DIR || "/data";

const paths = {
  knobs: path.join(STATE_DIR, "knobs.json"),
  canary: path.join(STATE_DIR, "canary.json"),
  audit: path.join(STATE_DIR, "audit.log")
};

fs.mkdirSync(STATE_DIR, { recursive: true });

const policy = loadPolicy(POLICY_PATH);
const policyValidation = validatePolicy(policy);
if (!policyValidation.ok) {
  throw new Error(`invalid policy: ${policyValidation.errors.join("; ")}`);
}

const state = {
  applies: 0,
  rejects: 0,
  lastApply: null
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(file, fallback = {}) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function signEntry(entry) {
  return crypto.createHmac("sha256", AUDIT_SIGNING_KEY).update(JSON.stringify(entry)).digest("hex");
}

function appendAudit(entry) {
  const signed = { ...entry, signature: signEntry(entry) };
  fs.appendFileSync(paths.audit, `${JSON.stringify(signed)}\n`, "utf8");
}

function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function isCriticalAction(action) {
  if (action.kind === "route") return true;
  if (action.kind !== "fee") return false;
  return classifyChange(`feeBands.${action.layer}.maxGwei`, policy) === "critical";
}

function verifyApply(expected) {
  const current = readJson(paths.knobs, {});
  return (expected.actions || []).every((action) => {
    if (action.kind !== "fee") return true;
    return current?.fees?.[action.layer]?.valueGwei === action.valueGwei;
  });
}

function applyDecision(decision, actor) {
  if (KILL_SWITCH) {
    return { ok: false, reason: "kill-switch" };
  }

  if (MANUAL_ONLY && actor !== "manual") {
    return { ok: false, reason: "manual-override-only" };
  }

  const validation = validateDecision(decision, policy, {
    now: Date.now(),
    metrics: decision.metrics || {},
    lastAppliedAt: {
      L1: state.lastApply?.L1 ?? 0,
      L2: state.lastApply?.L2 ?? 0,
      L3: state.lastApply?.L3 ?? 0
    }
  });
  if (!validation.ok) {
    state.rejects += 1;
    return { ok: false, reason: "policy-rejection", errors: validation.errors };
  }

  const hasCritical = (decision.actions || []).some((a) => isCriticalAction(a));
  if (hasCritical && actor !== "manual") {
    state.rejects += 1;
    return { ok: false, reason: "governance-required-for-critical-change" };
  }

  writeJson(paths.canary, { phase: "canary", decision, at: new Date().toISOString() });
  const applied = readJson(paths.knobs, { fees: {}, routes: [] });

  for (const action of decision.actions || []) {
    if (action.kind === "fee") {
      applied.fees[action.layer] = {
        valueGwei: action.valueGwei,
        deltaBps: action.deltaBps,
        at: new Date().toISOString()
      };
      state.lastApply = state.lastApply || {};
      state.lastApply[action.layer] = Date.now();
    }
    if (action.kind === "route") {
      const edge = `${action.from}->${action.to}`;
      if (!applied.routes.includes(edge)) applied.routes.push(edge);
    }
    if (action.kind === "throughput") {
      applied.throughput = applied.throughput || {};
      applied.throughput[action.layer] = {
        minRps: action.minRps,
        maxRps: action.maxRps,
        at: new Date().toISOString()
      };
    }
  }

  writeJson(paths.knobs, applied);

  if (!verifyApply(decision)) {
    state.rejects += 1;
    return { ok: false, reason: "post-apply-verification-failed" };
  }

  state.applies += 1;
  appendAudit({
    ts: new Date().toISOString(),
    actor,
    decisionId: decision.id,
    mode: decision.mode,
    result: "applied",
    actions: decision.actions
  });

  return { ok: true };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, {
      ok: true,
      service: "ghostload-controller",
      policyVersion: policy.version,
      killSwitch: KILL_SWITCH,
      manualOnly: MANUAL_ONLY,
      applies: state.applies,
      rejects: state.rejects
    });
  }

  if (req.method === "GET" && req.url === "/status") {
    return json(res, 200, {
      ok: true,
      state: readJson(paths.knobs, {}),
      auditPath: paths.audit
    });
  }

  if (req.method === "POST" && req.url === "/apply") {
    try {
      const body = await readBody(req);
      const decision = body.decision || null;
      const actor = body.actor || "ai";
      if (!decision) return json(res, 400, { ok: false, error: "decision required" });

      const result = applyDecision(decision, actor);
      const code = result.ok ? 200 : 409;
      return json(res, code, result);
    } catch (error) {
      return json(res, 500, { ok: false, error: error.message });
    }
  }

  return json(res, 404, { ok: false, error: "not_found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[ghostload-controller] listening on ${PORT}`);
});
