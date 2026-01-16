import express from "express";
import client from "prom-client";

const env = process.env;
const RPC_L2 = env.RPC_L2 || "http://ghostl2:9545";
const GUARD_URL = env.GUARD_URL || "http://host.docker.internal:7070";
const ADMIN_TOKEN = env.ADMIN_TOKEN || "";
const PORT = Number(env.PORT || 7575);
const OBSERVE_ONLY = env.OBSERVE_ONLY === "1";
const THROTTLE_THRESHOLD = Number(env.THROTTLE_THRESHOLD || 70);
const PAUSE_THRESHOLD = Number(env.PAUSE_THRESHOLD || 90);
const BASE_DELAY_MS = Number(env.BASE_DELAY_MS || 2000);
const MAX_DELAY_MS = Number(env.MAX_DELAY_MS || 8000);
const LOOP_MS = Number(env.LOOP_MS || 5000);

const app = express();
app.use(express.json());

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
const riskGauge = new client.Gauge({ name: "ai_monitor_risk_score", help: "Latest risk score 0-100" });
const congestionGauge = new client.Gauge({ name: "ai_monitor_congestion_score", help: "Latest congestion score 0-100" });
const actionGauge = new client.Gauge({ name: "ai_monitor_last_action", help: "0=none,1=delay,2=pause" });
registry.registerMetric(riskGauge);
registry.registerMetric(congestionGauge);
registry.registerMetric(actionGauge);

const headers = ADMIN_TOKEN ? { "content-type": "application/json", "x-admin-token": ADMIN_TOKEN } : { "content-type": "application/json" };

async function rpc(method, params = []) {
  const res = await fetch(RPC_L2, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!res.ok) throw new Error(`RPC ${method} status ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`RPC ${method} error: ${body.error.message || body.error}`);
  return body.result;
}

async function setDelay(seconds) {
  if (OBSERVE_ONLY) return;
  await fetch(`${GUARD_URL}/policy/delay`, {
    method: "POST",
    headers,
    body: JSON.stringify({ seconds })
  });
}

async function maybeAdjustPolicy(score, congestion) {
  actionGauge.set(0);
  if (score >= PAUSE_THRESHOLD) {
    // For now, use a high delay instead of hard pause to avoid mode flapping.
    const secs = Math.min(MAX_DELAY_MS / 1000, 10);
    await setDelay(secs);
    actionGauge.set(2);
    return;
  }
  if (score >= THROTTLE_THRESHOLD || congestion >= THROTTLE_THRESHOLD) {
    const factor = Math.min(1, Math.max(score, congestion) / 100);
    const delayMs = Math.min(MAX_DELAY_MS, Math.max(BASE_DELAY_MS, BASE_DELAY_MS * factor * 2));
    await setDelay(Math.round(delayMs / 1000));
    actionGauge.set(1);
    return;
  }
  // Clear delay if low risk.
  await setDelay(0);
}

function computeScores(latestBlock) {
  const gasUsed = Number(latestBlock.gasUsed || 0n);
  const gasLimit = Number(latestBlock.gasLimit || 1n);
  const gasRatio = gasLimit > 0 ? gasUsed / gasLimit : 0;
  const txCount = Array.isArray(latestBlock.transactions) ? latestBlock.transactions.length : 0;
  const congestion = Math.min(100, Math.round(gasRatio * 100));

  // Very simple risk heuristic: heavier blocks + more txs => higher score.
  let risk = congestion;
  if (txCount > 50) risk = Math.min(100, risk + 10);
  if (txCount > 100) risk = Math.min(100, risk + 10);

  return { risk, congestion, txCount, gasRatio };
}

async function loop() {
  try {
    const latestBlock = await rpc("eth_getBlockByNumber", ["latest", true]);
    const { risk, congestion } = computeScores(latestBlock);
    riskGauge.set(risk);
    congestionGauge.set(congestion);
    await maybeAdjustPolicy(risk, congestion);
  } catch (e) {
    console.error("[ai-monitor] loop error:", e?.message || e);
  } finally {
    setTimeout(loop, LOOP_MS);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, rpc: RPC_L2, guard: GUARD_URL, observeOnly: OBSERVE_ONLY });
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

app.listen(PORT, () => {
  console.log(`[ai-monitor] listening on ${PORT}, polling ${RPC_L2}, guard=${GUARD_URL}, observeOnly=${OBSERVE_ONLY}`);
  loop();
});
