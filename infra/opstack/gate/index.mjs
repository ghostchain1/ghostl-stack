#!/usr/bin/env node
import express from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ghost } from "ghost";

const PORT = Number(process.env.PORT || "8545");
const UPSTREAM_RPC = process.env.UPSTREAM_RPC || "http://l1:8545";
const STATE_DIR = process.env.STATE_DIR || "/state";
const DECISIONS_LOG = path.join(STATE_DIR, "guard-decisions.jsonl");
const POLICY_FILE = path.join(STATE_DIR, "guard-policy.json");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const ALLOW_INSECURE_ADMIN = process.env.ALLOW_INSECURE_ADMIN === "1";
const DEFAULT_DELAY_SECONDS = Number(process.env.DEFAULT_DELAY_SECONDS || "0");
const GUARD_WEBHOOK_URL = process.env.GUARD_WEBHOOK_URL || "";
const GUARD_EVAL_URL =
  process.env.GUARD_EVAL_URL ||
  (process.env.GUARD_URL ? `${process.env.GUARD_URL.replace(/\/$/, "")}/gate/eval` : "");
const MODEL_URL = process.env.MODEL_URL || "";
const MODEL_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS || "2000");

const BATCH_SENDER_ADDRESS = safeAddr(process.env.BATCH_SENDER_ADDRESS);
const PROPOSER_ADDRESS = safeAddr(process.env.PROPOSER_ADDRESS);

const state = {
  mode: "allow", // allow | pause | delay | block
  delaySeconds: DEFAULT_DELAY_SECONDS > 0 ? DEFAULT_DELAY_SECONDS : 0,
  nextAllowedAt: 0
};

const metrics = {
  startedAt: Date.now(),
  rpcRequests: 0,
  proxied: 0,
  blocked: 0,
  delayed: 0,
  guardErrors: 0,
  guardDecisions: 0,
  guardDecisionCounts: { allow: 0, deny: 0, delay: 0, error: 0 }
};

const recentDecisions = [];
const sseClients = new Set();
const circuitBreaker = {
  tripped: false,
  reason: "",
  until: 0
};
let policy = {
  version: 1,
  updatedAt: Date.now(),
  thresholds: { delay: 6, block: 12 },
  allowlist: [],
  denylist: [],
  rules: [
    { id: "high-value", if: { txValueEthGte: 5 }, risk: 8, reason: "high_value" },
    { id: "large-tx-count", if: { blockTxCountGte: 500 }, risk: 10, reason: "large_block" }
  ]
};

async function loadPolicy() {
  try {
    const raw = await fs.readFile(POLICY_FILE, "utf8");
    policy = JSON.parse(raw);
    policy.updatedAt = policy.updatedAt || Date.now();
    console.log("[gate] loaded guard policy", { version: policy.version, updatedAt: policy.updatedAt });
  } catch (e) {
    console.warn("[gate] using default guard policy", e?.message || e);
  }
}

async function savePolicy(nextPolicy) {
  policy = { ...nextPolicy, updatedAt: Date.now() };
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(POLICY_FILE, JSON.stringify(policy, null, 2), "utf8");
  console.log("[gate] saved guard policy", { version: policy.version, updatedAt: policy.updatedAt });
}

function safeAddr(a) {
  try {
    return a ? ghost.getAddress(a) : null;
  } catch {
    return null;
  }
}

function normalizeAction(action) {
  const a = String(action || "").toLowerCase();
  if (["allow", "pause", "delay", "block"].includes(a)) return a;
  if (["reject", "quarantine"].includes(a)) return "block";
  return "allow";
}

async function appendDecision(entry) {
  recentDecisions.push(entry);
  while (recentDecisions.length > 200) recentDecisions.shift();
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.appendFile(DECISIONS_LOG, JSON.stringify(entry) + "\n", "utf8");
  } catch (e) {
    console.error("[gate] failed to write decision log:", e);
  }

  const payload = JSON.stringify(entry);
  for (const res of sseClients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(res);
    }
  }

  if (GUARD_WEBHOOK_URL) {
    fetch(GUARD_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload
    }).catch((err) => console.warn("[gate] guard webhook failed:", err?.message || err));
  }
}

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN && !ALLOW_INSECURE_ADMIN) {
    return res.status(403).json({ ok: false, error: "ADMIN_TOKEN not configured" });
  }
  if (!ADMIN_TOKEN && ALLOW_INSECURE_ADMIN) return next();
  const token = req.header("x-admin-token");
  if (!token || token !== ADMIN_TOKEN) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}

async function guardEval(context) {
  if (!GUARD_EVAL_URL) return null;
  try {
    const r = await fetch(GUARD_EVAL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(context)
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const body = await r.json();
    metrics.guardDecisions += 1;
    return body;
  } catch (e) {
    metrics.guardErrors += 1;
    console.warn("[gate] guard eval failed:", e?.message ?? String(e));
    return null;
  }
}

async function forwardRpc(body) {
  const r = await fetch(UPSTREAM_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`upstream status ${r.status}: ${txt}`);
  }
  return r.json();
}

function gateDecisionForTx(txSummary) {
  const now = Date.now();
  if (state.mode === "pause") {
    return { action: "pause", reason: "manual_pause" };
  }
  if (state.mode === "block") {
    return { action: "block", reason: "manual_block" };
  }
  if (state.mode === "delay") {
    if (now < state.nextAllowedAt) {
      return { action: "delay", reason: "manual_delay", retryAt: state.nextAllowedAt };
    }
    state.nextAllowedAt = now + state.delaySeconds * 1000;
    return { action: "delay", reason: "manual_delay", retryAt: state.nextAllowedAt };
  }
  return { action: "allow", reason: "manual_allow" };
}

async function handleSendRawTx(body) {
  const raw = body.params?.[0];
  if (!raw || typeof raw !== "string") {
    return { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32602, message: "missing raw tx" } };
  }
  let tx;
  try {
    tx = ghost.Transaction.from(raw);
  } catch (e) {
    return { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32602, message: `invalid raw tx: ${e?.message ?? e}` } };
  }

  const dataHex = tx.data ?? "0x";
  const txSummary = {
    hash: tx.hash,
    from: tx.from ? ghost.getAddress(tx.from) : null,
    to: tx.to ? ghost.getAddress(tx.to) : null,
    nonce: tx.nonce,
    type: tx.type,
    value: tx.value?.toString() ?? "0",
    gasLimit: tx.gasLimit?.toString() ?? null,
    dataLength: dataHex.length > 2 ? dataHex.length / 2 - 1 : 0,
    dataHash: ghost.keccak256(dataHex),
    selector: dataHex.length >= 10 ? dataHex.slice(0, 10) : "0x00000000"
  };

  let role = "unknown";
  if (txSummary.from && BATCH_SENDER_ADDRESS && txSummary.from === BATCH_SENDER_ADDRESS) role = "batcher";
  else if (txSummary.from && PROPOSER_ADDRESS && txSummary.from === PROPOSER_ADDRESS) role = "proposer";

  const manualDecision = gateDecisionForTx(txSummary);
  let decision = { ...manualDecision, source: "manual" };

  if (manualDecision.action === "allow") {
    const guardDecision = await guardEval({ role, tx: txSummary });
    if (guardDecision?.action) {
      decision = { ...guardDecision, action: normalizeAction(guardDecision.action), source: "guard" };
    }
  }

  const entry = {
    ts: Date.now(),
    role,
    action: decision.action,
    reason: decision.reason || "",
    risk: typeof decision.risk === "number" ? decision.risk : null,
    delaySeconds: decision.delaySeconds || state.delaySeconds,
    retryAt: decision.retryAt || null,
    tx: txSummary
  };

  if (decision.action === "allow") {
    const upstream = await forwardRpc(body);
    entry.result = "forwarded";
    metrics.proxied += 1;
    await appendDecision(entry);
    return upstream;
  }

  if (decision.action === "delay") {
    metrics.delayed += 1;
    entry.result = "delayed";
    entry.retryAt = entry.retryAt || Date.now() + entry.delaySeconds * 1000;
    state.nextAllowedAt = entry.retryAt;
    await appendDecision(entry);
    return {
      jsonrpc: "2.0",
      id: body.id ?? null,
      error: {
        code: -32099,
        message: "op-gate delayed",
        data: { action: "delay", reason: decision.reason, retryAt: entry.retryAt }
      }
    };
  }

  metrics.blocked += 1;
  entry.result = "blocked";
  await appendDecision(entry);
  return {
    jsonrpc: "2.0",
    id: body.id ?? null,
    error: {
      code: -32098,
      message: `op-gate ${decision.action}`,
      data: { action: decision.action, reason: decision.reason }
    }
  };
}

async function handleBlobBaseFee(body) {
  try {
    const upstream = await forwardRpc(body);
    if (!upstream?.error) return upstream;
  } catch {
    // Fall through to a safe default when the upstream RPC lacks blob support.
  }
  try {
    const block = await forwardRpc({
      jsonrpc: "2.0",
      id: body.id ?? null,
      method: "eth_getBlockByNumber",
      params: ["latest", false]
    });
    const baseFee = block?.result?.baseFeePerGas;
    if (baseFee) {
      return { jsonrpc: "2.0", id: body.id ?? null, result: baseFee };
    }
  } catch {
    // Ignore and return a minimal non-zero fee below.
  }
  return { jsonrpc: "2.0", id: body.id ?? null, result: "0x1" };
}

async function handleRpc(body) {
  metrics.rpcRequests += 1;
  const method = body.method;
  if (method === "eth_sendRawTransaction") {
    return handleSendRawTx(body);
  }
  if (method === "eth_blobBaseFee") {
    return handleBlobBaseFee(body);
  }
  return forwardRpc(body);
}

function promLine(name, value, labels) {
  const l = labels
    ? `{${Object.entries(labels)
        .map(([k, v]) => `${k}="${String(v).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`)
        .join(",")}}`
    : "";
  return `${name}${l} ${value}\n`;
}

const app = express();
app.use(express.json({ limit: "10mb" }));

// Simple guard endpoints for op-node / op-proposer vetting.
function guardDecisionFromMode() {
  const now = Date.now();
  if (state.mode === "pause") return { allow: false, reason: "manual_pause" };
  if (state.mode === "block") return { allow: false, reason: "manual_block" };
  if (state.mode === "delay") {
    const retryAt = Math.max(state.nextAllowedAt, now + state.delaySeconds * 1000);
    state.nextAllowedAt = retryAt;
    return { allow: false, reason: "manual_delay", retryAt };
  }
  return { allow: true, reason: "manual_allow" };
}

function evaluatePolicy(context) {
  let risk = 0;
  let reason = "policy_allow";

  const subject = context.tx || context.block || context.proposal || {};
  const from = subject.from ? safeAddr(subject.from) : null;

  if (from && policy.allowlist?.includes(from)) {
    return { allow: true, reason: "allowlist" };
  }
  if (from && policy.denylist?.includes(from)) {
    return { allow: false, reason: "denylist" };
  }

  if (context.tx) {
    const valueEth = Number(ghost.formatEther(context.tx.value || "0"));
    if (valueEth >= 1) {
      risk += Math.min(12, Math.floor(valueEth));
      reason = "high_value";
    }
    if (context.tx.dataLength > 10000) {
      risk += 4;
      reason = "large_calldata";
    }
  }

  if (context.block) {
    if (context.block.txCount && context.block.txCount >= 500) {
      risk += 10;
      reason = "large_block";
    }
  }

  for (const rule of policy.rules || []) {
    const cond = rule.if || {};
    if (cond.blockTxCountGte && context.block?.txCount >= cond.blockTxCountGte) {
      risk += rule.risk || 0;
      reason = rule.reason || rule.id || "rule_match";
    }
    if (cond.txValueEthGte && context.tx) {
      const valueEth = Number(ghost.formatEther(context.tx.value || "0"));
      if (valueEth >= cond.txValueEthGte) {
        risk += rule.risk || 0;
        reason = rule.reason || rule.id || "rule_match";
      }
    }
  }

  const delayCutoff = policy.thresholds?.delay ?? 6;
  const blockCutoff = policy.thresholds?.block ?? 12;
  if (risk >= blockCutoff) return { allow: false, reason, risk };
  if (risk >= delayCutoff) {
    return {
      allow: false,
      reason,
      risk,
      retryAt: Date.now() + Math.max(5_000, state.delaySeconds * 1000)
    };
  }
  return { allow: true, reason, risk };
}

function recordGuardDecision(endpoint, decision, context) {
  metrics.guardDecisions += 1;
  if (decision.error) {
    metrics.guardDecisionCounts.error += 1;
  } else if (decision.retryAt) {
    metrics.guardDecisionCounts.delay += 1;
  } else if (decision.allow) {
    metrics.guardDecisionCounts.allow += 1;
  } else {
    metrics.guardDecisionCounts.deny += 1;
  }
  appendDecision({
    ts: Date.now(),
    endpoint,
    decision,
    ctx: context
  }).catch((e) => console.error("[gate] appendDecision failed", e));
}

app.post("/guard/op-node", async (req, res) => {
  // Base decision from manual mode
  let decision = guardDecisionFromMode();

  if (decision.allow) {
    const policyDecision = evaluatePolicy({
      block: {
        txCount: req.body?.txCount,
        hash: req.body?.block?.hash,
        number: req.body?.block?.number
      }
    });
    decision = { allow: policyDecision.allow, reason: policyDecision.reason, retryAt: policyDecision.retryAt };
  }

  // Circuit breaker
  if (circuitBreaker.tripped && Date.now() < circuitBreaker.until) {
    decision = { allow: false, reason: circuitBreaker.reason || "circuit_breaker" };
  } else if (circuitBreaker.tripped && Date.now() >= circuitBreaker.until) {
    circuitBreaker.tripped = false;
    circuitBreaker.reason = "";
  }

  // Optional external guard eval (GUARD_EVAL_URL) re-used from tx path
  if (decision.allow && GUARD_EVAL_URL) {
    const guardResp = await guardEval({ role: "op-node", block: req.body?.block });
    if (guardResp?.action) {
      const action = normalizeAction(guardResp.action);
      decision = { allow: action === "allow", reason: guardResp.reason || action, retryAt: guardResp.retryAt };
    }
  }

  // Optional model scoring
  if (decision.allow && MODEL_URL) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
      const resp = await fetch(MODEL_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "op-node", block: req.body }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (resp.ok) {
        const model = await resp.json();
        if (typeof model.risk === "number" && model.risk >= (policy.thresholds?.block ?? 12)) {
          decision = { allow: false, reason: model.reason || "model_block" };
        } else if (typeof model.risk === "number" && model.risk >= (policy.thresholds?.delay ?? 6)) {
          decision = { allow: false, reason: model.reason || "model_delay", retryAt: Date.now() + 5000 };
        }
      }
    } catch (e) {
      metrics.guardErrors += 1;
    }
  }

  recordGuardDecision("op-node", decision, req.body);
  res.json(decision);
});

app.post("/guard/proposer", async (req, res) => {
  let decision = guardDecisionFromMode();

  if (decision.allow) {
    const policyDecision = evaluatePolicy({
      proposal: req.body,
      tx: {
        value: req.body?.value || "0"
      }
    });
    decision = { allow: policyDecision.allow, reason: policyDecision.reason, retryAt: policyDecision.retryAt };
  }

  if (circuitBreaker.tripped && Date.now() < circuitBreaker.until) {
    decision = { allow: false, reason: circuitBreaker.reason || "circuit_breaker" };
  } else if (circuitBreaker.tripped && Date.now() >= circuitBreaker.until) {
    circuitBreaker.tripped = false;
    circuitBreaker.reason = "";
  }

  if (decision.allow && GUARD_EVAL_URL) {
    const guardResp = await guardEval({ role: "proposer", proposal: req.body });
    if (guardResp?.action) {
      const action = normalizeAction(guardResp.action);
      decision = { allow: action === "allow", reason: guardResp.reason || action, retryAt: guardResp.retryAt };
    }
  }

  if (decision.allow && MODEL_URL) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
      const resp = await fetch(MODEL_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "proposer", proposal: req.body }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (resp.ok) {
        const model = await resp.json();
        if (typeof model.risk === "number" && model.risk >= (policy.thresholds?.block ?? 12)) {
          decision = { allow: false, reason: model.reason || "model_block" };
        } else if (typeof model.risk === "number" && model.risk >= (policy.thresholds?.delay ?? 6)) {
          decision = { allow: false, reason: model.reason || "model_delay", retryAt: Date.now() + 5000 };
        }
      }
    } catch (e) {
      metrics.guardErrors += 1;
    }
  }

  recordGuardDecision("proposer", decision, req.body);
  res.json(decision);
});

app.post("/", async (req, res) => {
  const body = req.body;
  try {
    if (Array.isArray(body)) {
      const results = await Promise.all(body.map((b) => handleRpc(b)));
      res.json(results);
    } else {
      const result = await handleRpc(body);
      res.json(result);
    }
  } catch (e) {
    console.error("[gate] rpc error", e);
    res.status(500).json({ jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32000, message: String(e) } });
  }
});

app.get("/gate/status", (_req, res) => {
  res.json({
    ok: true,
    mode: state.mode,
    delaySeconds: state.delaySeconds,
    nextAllowedAt: state.nextAllowedAt,
    policy,
    metrics,
    recentDecisions: recentDecisions.slice(-50)
  });
});

app.post("/gate/mode", requireAdmin, (req, res) => {
  const mode = String(req.body?.mode || "allow").toLowerCase();
  const delaySecondsRaw = Number(req.body?.delaySeconds ?? state.delaySeconds);
  const delaySeconds = Number.isFinite(delaySecondsRaw) && delaySecondsRaw >= 0 ? Math.floor(delaySecondsRaw) : 0;
  if (!["allow", "pause", "delay", "block"].includes(mode)) {
    return res.status(400).json({ ok: false, error: "mode must be allow|pause|delay|block" });
  }
  state.mode = mode;
  state.delaySeconds = delaySeconds;
  state.nextAllowedAt = 0;
  res.json({ ok: true, mode, delaySeconds });
});

app.get("/guard/policy", requireAdmin, (_req, res) => {
  res.json({ ok: true, policy });
});

app.post("/guard/policy", requireAdmin, async (req, res) => {
  const next = req.body;
  if (!next || typeof next !== "object") {
    return res.status(400).json({ ok: false, error: "policy must be an object" });
  }
  try {
    await savePolicy(next);
    res.json({ ok: true, policy });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post("/guard/circuit-breaker", requireAdmin, (req, res) => {
  const minutes = Number(req.body?.minutes || 5);
  const reason = req.body?.reason || "admin_trip";
  circuitBreaker.tripped = true;
  circuitBreaker.reason = reason;
  circuitBreaker.until = Date.now() + Math.max(1, minutes) * 60_000;
  res.json({ ok: true, circuitBreaker });
});

app.delete("/guard/circuit-breaker", requireAdmin, (_req, res) => {
  circuitBreaker.tripped = false;
  circuitBreaker.reason = "";
  circuitBreaker.until = 0;
  res.json({ ok: true, circuitBreaker });
});

app.get("/metrics/prom", (_req, res) => {
  res.type("text/plain; version=0.0.4");
  let out = "";
  out += promLine("op_gate_up", 1);
  out += promLine("op_gate_mode", 1, { mode: state.mode });
  out += promLine("op_gate_delay_seconds", state.delaySeconds);
  out += promLine("op_gate_requests_total", metrics.rpcRequests);
  out += promLine("op_gate_proxied_total", metrics.proxied);
  out += promLine("op_gate_blocked_total", metrics.blocked);
  out += promLine("op_gate_delayed_total", metrics.delayed);
  out += promLine("op_gate_guard_errors_total", metrics.guardErrors);
  out += promLine("op_gate_guard_decisions_total", metrics.guardDecisions);
  out += promLine("op_gate_guard_decisions", metrics.guardDecisionCounts.allow, { result: "allow" });
  out += promLine("op_gate_guard_decisions", metrics.guardDecisionCounts.deny, { result: "deny" });
  out += promLine("op_gate_guard_decisions", metrics.guardDecisionCounts.delay, { result: "delay" });
  out += promLine("op_gate_guard_decisions", metrics.guardDecisionCounts.error, { result: "error" });
  res.send(out);
});

// SSE stream of guard decisions
app.get("/guard/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

app.listen(PORT, () => {
  loadPolicy().then(() => {
    console.log(`[gate] listening on :${PORT}, upstream ${UPSTREAM_RPC}, guard ${GUARD_EVAL_URL || "none"}`);
  });
});
