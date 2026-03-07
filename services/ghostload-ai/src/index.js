import fs from "node:fs";
import http from "node:http";
import { buildDecision, fallbackDecision, loadValidatedPolicy } from "./control.js";

const PORT = Number(process.env.PORT || 7688);
const POLICY_PATH = process.env.GHOSTLOAD_POLICY_PATH || "";
const KILL_SWITCH = process.env.GHOSTLOAD_KILL_SWITCH === "1";
const MANUAL_ONLY = process.env.GHOSTLOAD_MANUAL_ONLY === "1";

const policy = loadValidatedPolicy(POLICY_PATH);
const state = {
  lastDecision: null,
  decisions: 0,
  fallbacks: 0,
  policyRejections: 0
};

function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function metricsText() {
  return [
    "# HELP ai_decisions_total Number of AI decision attempts",
    "# TYPE ai_decisions_total counter",
    `ai_decisions_total ${state.decisions}`,
    "# HELP ai_fallback_total Number of AI fallback decisions",
    "# TYPE ai_fallback_total counter",
    `ai_fallback_total ${state.fallbacks}`,
    "# HELP policy_rejections_total Number of decisions rejected by policy",
    "# TYPE policy_rejections_total counter",
    `policy_rejections_total ${state.policyRejections}`
  ].join("\n");
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, {
      ok: true,
      service: "ghostload-ai",
      killSwitch: KILL_SWITCH,
      manualOnly: MANUAL_ONLY,
      policyVersion: policy.version
    });
  }

  if (req.method === "GET" && req.url === "/metrics") {
    res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
    res.end(metricsText());
    return;
  }

  if (req.method === "GET" && req.url === "/stats") {
    return json(res, 200, {
      ok: true,
      stats: {
        decisions: state.decisions,
        fallbacks: state.fallbacks,
        policyRejections: state.policyRejections,
        killSwitch: KILL_SWITCH,
        manualOnly: MANUAL_ONLY,
        fetchedAt: new Date().toISOString(),
      },
    });
  }

  if (req.method === "GET" && req.url === "/explain") {
    return json(res, 200, {
      ok: true,
      lastDecision: state.lastDecision,
      explanation: state.lastDecision?.explanation || "No decision yet"
    });
  }

  if (req.method === "POST" && req.url === "/decide") {
    state.decisions += 1;

    if (KILL_SWITCH || MANUAL_ONLY) {
      state.fallbacks += 1;
      const decision = fallbackDecision(policy, KILL_SWITCH ? "kill-switch" : "manual-only");
      decision.explanation = "Autonomous mode disabled by hard guard";
      state.lastDecision = decision;
      return json(res, 200, { ok: true, decision, guard: { ok: true, errors: [] } });
    }

    try {
      const body = await readBody(req);
      const metrics = body.metrics || {};
      const context = body.context || {};
      const { decision, guard } = buildDecision(metrics, policy, context);

      if (!guard.ok) {
        state.policyRejections += 1;
        state.fallbacks += 1;
        const safe = fallbackDecision(policy, "policy-rejection");
        safe.rejectedErrors = guard.errors;
        safe.explanation = "Primary decision rejected by policy/invariants; fallback applied";
        state.lastDecision = safe;
        return json(res, 200, { ok: true, decision: safe, guard });
      }

      decision.explanation = `fee stabilization with bounded deltas; projected risk=${guard.impact.riskScore.toFixed(3)}`;
      state.lastDecision = decision;
      return json(res, 200, { ok: true, decision, guard });
    } catch (error) {
      state.fallbacks += 1;
      const safe = fallbackDecision(policy, "exception");
      safe.explanation = `Exception in /decide: ${error.message}`;
      state.lastDecision = safe;
      return json(res, 200, { ok: true, decision: safe, guard: { ok: false, errors: [error.message] } });
    }
  }

  json(res, 404, { ok: false, error: "not_found" });
});

server.listen(PORT, "0.0.0.0", () => {
  fs.mkdirSync("/tmp", { recursive: true });
  console.log(`[ghostload-ai] listening on ${PORT}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
