import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { ghostbrainRegister, ghostbrainStartHeartbeat } from "./ghostbrain-client.js";

import {
  getEvidencePack,
  getProposal,
  getRankedStrategies,
  insertProposal,
  listProposals,
  openDb,
  replaceRankedStrategies,
  upsertEvidencePack
} from "./db.js";
import { buildRankedStrategies } from "./ranking.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || "7685");
const HOST = process.env.HOST || "0.0.0.0";
const DB_PATH = process.env.DB_PATH || "/data/hyper-ghost-governor.sqlite";
const ARTIFACTS_ROOT = process.env.ARTIFACTS_ROOT || "/artifacts/governor";
const GOVERNOR_ADMIN_TOKEN = String(process.env.GOVERNOR_ADMIN_TOKEN || "").trim();
const TREASURY_STATUS_URL = String(process.env.TREASURY_STATUS_URL || "http://treasury-engine:7683/v1/treasury/status").trim();
const REQUEST_TIMEOUT_MS = Math.max(500, Number(process.env.REQUEST_TIMEOUT_MS || "4500"));

const db = openDb({ dbPath: DB_PATH, migrationPath: path.join(__dirname, "..", "migrations", "0001_init.sql") });
fs.mkdirSync(ARTIFACTS_ROOT, { recursive: true });

const app = express();
app.use(express.json({ limit: "2mb" }));

const metrics = {
  draftedTotal: 0,
  rankLatencyMs: 0,
  policyViolationTotal: 0
};

const log = (level, message, extra = {}) => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: "hyper-ghost-governor",
      message,
      ...extra
    })
  );
};

const withAdmin = (req, res, next) => {
  if (!GOVERNOR_ADMIN_TOKEN) return next();
  const token = String(req.header("x-admin-token") || "").trim();
  if (!token || token !== GOVERNOR_ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
};

const fetchTreasurySnapshot = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(TREASURY_STATUS_URL, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`treasury_status_http_${response.status}`);
    const body = await response.json();
    const treasury = body?.treasury || {};
    return {
      totalValueWei: String(treasury.totalValueWei || "0"),
      deployedCapitalWei: String(treasury.deployedCapitalWei || "0"),
      availableWei: String(treasury.availableWei || "0"),
      riskExposureBps: Number(treasury.riskExposureBps || 0)
    };
  } finally {
    clearTimeout(timeout);
  }
};

const writeEvidenceBundle = ({ proposalId, payload }) => {
  const bundlePath = path.join(ARTIFACTS_ROOT, proposalId);
  fs.mkdirSync(bundlePath, { recursive: true });

  const files = [
    { name: "snapshot.json", data: payload.snapshot },
    { name: "ranking.json", data: payload.ranking },
    { name: "summary.json", data: payload.summary },
    { name: "execution-plan.json", data: payload.executionPlan }
  ];

  const written = [];
  for (const file of files) {
    const filePath = path.join(bundlePath, file.name);
    fs.writeFileSync(filePath, JSON.stringify(file.data, null, 2));
    written.push(filePath);
  }

  const markdown = [
    `# Hyper Ghost Governor Evidence Pack`,
    ``,
    `- proposal_id: ${proposalId}`,
    `- generated_at: ${new Date().toISOString()}`,
    `- strategy_count: ${payload.summary.strategyCount}`,
    `- policy_violations: ${payload.summary.violations}`,
    `- top_strategy: ${payload.summary.topStrategyId || "none"}`,
    ``,
    `## Files`,
    ...written.map((filePath) => `- ${filePath}`)
  ].join("\n");

  const summaryPath = path.join(bundlePath, "README.md");
  fs.writeFileSync(summaryPath, markdown);
  written.push(summaryPath);

  return { bundlePath, files: written };
};

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "hyper-ghost-governor",
    artifactsRoot: ARTIFACTS_ROOT
  });
});

app.get("/metrics", (_req, res) => {
  res.type("text/plain").send(
    [
      "# HELP hg_proposals_drafted_total Total drafted treasury governance proposals",
      "# TYPE hg_proposals_drafted_total counter",
      `hg_proposals_drafted_total ${metrics.draftedTotal}`,
      "# HELP hg_strategy_rank_latency_ms Last deterministic strategy ranking latency",
      "# TYPE hg_strategy_rank_latency_ms gauge",
      `hg_strategy_rank_latency_ms ${metrics.rankLatencyMs}`,
      "# HELP hg_policy_violation_total Total strategy policy violations detected",
      "# TYPE hg_policy_violation_total counter",
      `hg_policy_violation_total ${metrics.policyViolationTotal}`
    ].join("\n")
  );
});

app.get("/proposals", (_req, res) => {
  res.json({ ok: true, proposals: listProposals(db, 200) });
});

app.post("/proposals/draft", withAdmin, async (req, res) => {
  const startedAt = Date.now();
  try {
    const proposalId = String(req.body?.proposalId || `hg-${crypto.randomUUID()}`).trim();
    const treasurySnapshot = req.body?.treasurySnapshot || (await fetchTreasurySnapshot());
    const volatilityBand = String(req.body?.volatilityBand || "medium");
    const riskCapBps = Number(req.body?.riskCapBps || 7200);
    const maxProtocolConcentrationBps = Number(req.body?.maxProtocolConcentrationBps || 4500);
    const policyVersion = String(req.body?.policyVersion || "federation-v1");

    const ranking = buildRankedStrategies({
      treasury: treasurySnapshot,
      volatilityBand,
      riskCapBps,
      maxProtocolConcentrationBps,
      policyVersion
    });

    const violationCount = ranking.strategies.reduce((sum, strategy) => sum + strategy.policyViolations.length, 0);
    metrics.policyViolationTotal += violationCount;

    const executionPlan = {
      governanceRequired: true,
      timelockRequired: true,
      humanSignoffRequired: true,
      executionMode: "proposal_only",
      note: "AI governor can only draft; treasury execution must be performed by governance executor."
    };

    const evidence = writeEvidenceBundle({
      proposalId,
      payload: {
        snapshot: treasurySnapshot,
        ranking: ranking.strategies,
        summary: ranking.summary,
        executionPlan
      }
    });

    const createdAt = new Date().toISOString();
    insertProposal(db, {
      proposalId,
      createdAt,
      treasurySnapshot,
      input: {
        volatilityBand,
        riskCapBps,
        maxProtocolConcentrationBps,
        policyVersion,
        source: "hyper-ghost-governor"
      },
      summary: ranking.summary
    });
    replaceRankedStrategies(db, proposalId, ranking.strategies, createdAt);
    upsertEvidencePack(db, {
      proposalId,
      bundlePath: evidence.bundlePath,
      createdAt,
      files: evidence.files
    });

    metrics.draftedTotal += 1;
    metrics.rankLatencyMs = Date.now() - startedAt;

    log("info", "proposal_drafted", {
      proposalId,
      violationCount,
      strategyCount: ranking.strategies.length,
      topStrategy: ranking.summary.topStrategyId,
      latencyMs: metrics.rankLatencyMs
    });

    res.status(201).json({
      ok: true,
      proposalId,
      summary: ranking.summary,
      strategies: ranking.strategies,
      evidence: {
        bundlePath: evidence.bundlePath,
        files: evidence.files
      },
      executionPlan
    });
  } catch (error) {
    metrics.rankLatencyMs = Date.now() - startedAt;
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "proposal_draft_failed"
    });
  }
});

app.get("/proposals/:id/evidence", (req, res) => {
  const proposalId = String(req.params.id || "").trim();
  if (!proposalId) {
    res.status(400).json({ ok: false, error: "proposal_id_required" });
    return;
  }

  const proposal = getProposal(db, proposalId);
  const strategies = getRankedStrategies(db, proposalId);
  const evidence = getEvidencePack(db, proposalId);
  if (!proposal || !evidence) {
    res.status(404).json({ ok: false, error: "proposal_not_found" });
    return;
  }

  res.json({
    ok: true,
    proposal,
    strategies,
    evidence
  });
});

app.listen(PORT, HOST, () => {
  log("info", "service_started", {
    host: HOST,
    port: PORT,
    dbPath: DB_PATH,
    artifactsRoot: ARTIFACTS_ROOT,
    treasuryStatusUrl: TREASURY_STATUS_URL
  });
  // ── GhostBrain Core registration ───────────────────────────────────────
  ghostbrainRegister().then(() => ghostbrainStartHeartbeat());
});
