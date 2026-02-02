import express from "express";
import fs from "fs";
import path from "path";

const PORT = Number(process.env.PORT || 7628);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";
const APPROVAL_TOKEN = process.env.EXECUTION_APPROVAL_TOKEN || "";
const APPROVAL_FILE = process.env.TREASURY_STATE_FILE || path.join(process.cwd(), "data", "treasury-proposals.json");
const OBSERVABILITY_FILE = process.env.TREASURY_OBSERVABILITY_FILE || path.join(process.cwd(), "data", "treasury-observability.json");

const app = express();
app.use(express.json());

const promQuery = async (query) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`prom status ${resp.status}`);
    return await resp.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "treasury-service" }));

app.get("/treasury", async (_req, res) => {
  try {
    const balResp = await promQuery("treasury_balance_total");
    const bal = balResp?.data?.result?.[0]?.value?.[1] || "0";
    res.json({ ok: true, balance: bal, txs: [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

const loadObservability = () => {
  try {
    const raw = fs.readFileSync(OBSERVABILITY_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      healthScore: 0.5,
      runwayDays: 0,
      riskPosture: "unknown",
      policyCompliance: false,
      proposalHistory: [],
      rebalancingHistory: [],
      federationTreaties: []
    };
  }
};

app.get("/treasury/overview", (_req, res) => {
  const data = loadObservability();
  res.json({ ok: true, ...data });
});

app.get("/treasury/proposals", (_req, res) => {
  const data = loadObservability();
  res.json({ ok: true, proposals: data.proposalHistory || [] });
});

app.get("/treasury/rebalances", (_req, res) => {
  const data = loadObservability();
  res.json({ ok: true, rebalances: data.rebalancingHistory || [] });
});

app.get("/treasury/federation", (_req, res) => {
  const data = loadObservability();
  res.json({ ok: true, treaties: data.federationTreaties || [] });
});

app.get("/metrics", (_req, res) => {
  const data = loadObservability();
  const health = Number(data.healthScore || 0);
  const runway = Number(data.runwayDays || 0);
  const risk = typeof data.riskScore === "number" ? data.riskScore : 0;
  const compliance = data.policyCompliance ? 1 : 0;
  res.type("text/plain");
  res.send(
    [
      `treasury_health_score ${health}`,
      `treasury_runway_days ${runway}`,
      `treasury_risk_score ${risk}`,
      `treasury_policy_compliance ${compliance}`
    ].join("\n")
  );
});

const loadApprovals = () => {
  try {
    const raw = fs.readFileSync(APPROVAL_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

app.post("/treasury/withdraw", (req, res) => {
  if (!APPROVAL_TOKEN) {
    res.status(500).json({ ok: false, error: "approval token not configured" });
    return;
  }
  if (req.header("x-execution-token") !== APPROVAL_TOKEN) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  const { proposalId, amount, to } = req.body || {};
  if (!proposalId || !amount || !to) {
    res.status(400).json({ ok: false, error: "proposalId, amount, to required" });
    return;
  }
  const approvals = loadApprovals();
  const proposal = approvals.find((p) => p.id === proposalId);
  if (!proposal) {
    res.status(404).json({ ok: false, error: "proposal_not_found" });
    return;
  }
  if ((proposal.approvals || []).length < 2) {
    res.status(400).json({ ok: false, error: "insufficient_approvals" });
    return;
  }
  res.json({ ok: true, queued: { proposalId, amount, to, approvals: proposal.approvals.length } });
});

app.listen(PORT, () => {
  console.log(`[treasury-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
