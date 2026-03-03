import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { Counter, Registry, collectDefaultMetrics } from "prom-client";
import { ghostbrainRegister, ghostbrainStartHeartbeat } from "./ghostbrain-client";

type RiskInput = {
  strategyId: string;
  strategyType?: string;
  volatility30d: number;
  drawdown30d: number;
  liquidityScore: number;
  smartContractScore: number;
  concentrationScore?: number;
};

type RiskRecommendation = {
  recommendationId: string;
  timestamp: string;
  strategyId: string;
  scoreBps: number;
  tier: "low" | "medium" | "high";
  maxAllocationBps: number;
  rationale: string[];
  signature: string;
};

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || "7602");
const HOST = process.env.HOST || "0.0.0.0";

function resolveSigningSecret(raw: string | undefined): string {
  const candidate = String(raw || "").trim();
  const isPlaceholder =
    candidate.length === 0 ||
    candidate === "dev-placeholder-secret" ||
    candidate === "__SET_IN_VAULT__";
  const strictMode = process.env.NODE_ENV === "production";

  if (strictMode && isPlaceholder) {
    throw new Error("RISK_SIGNING_SECRET must be set from Vault/KMS in production mode");
  }

  if (isPlaceholder) {
    return "dev-placeholder-secret";
  }

  return candidate;
}

const SIGNING_SECRET = resolveSigningSecret(process.env.RISK_SIGNING_SECRET);

const resolveWritableDir = (preferred: string, fallbackName: string): string => {
  const candidates = [preferred, path.join("/tmp", fallbackName)];
  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      const probe = path.join(candidate, ".write-probe");
      fs.writeFileSync(probe, "ok", { encoding: "utf-8" });
      fs.unlinkSync(probe);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return "/tmp";
};

const OUTPUT_DIR = resolveWritableDir(process.env.RECOMMENDATION_DIR || "/tmp/ghost-risk", "ghost-risk");

const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "hg_risk_oracle_" });
const totalScored = new Counter({
  name: "hg_risk_oracle_scores_total",
  help: "Total number of scored strategies",
  registers: [registry]
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeRiskScore(input: RiskInput): { scoreBps: number; rationale: string[] } {
  const rationale: string[] = [];
  const vol = clamp(input.volatility30d, 0, 100);
  const drawdown = clamp(input.drawdown30d, 0, 100);
  const liq = clamp(input.liquidityScore, 0, 100);
  const sec = clamp(input.smartContractScore, 0, 100);
  const conc = clamp(input.concentrationScore ?? 50, 0, 100);

  const riskPct =
    vol * 0.30 +
    drawdown * 0.30 +
    (100 - liq) * 0.15 +
    (100 - sec) * 0.15 +
    conc * 0.10;

  if (vol > 60) rationale.push("high_volatility_30d");
  if (drawdown > 40) rationale.push("high_drawdown_30d");
  if (liq < 50) rationale.push("liquidity_risk");
  if (sec < 60) rationale.push("smart_contract_risk");
  if (conc > 70) rationale.push("concentration_risk");
  if (rationale.length === 0) rationale.push("risk_within_default_bounds");

  return { scoreBps: Math.round(riskPct * 100), rationale };
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", SIGNING_SECRET).update(payload).digest("hex");
}

function maxAllocationFromTier(tier: "low" | "medium" | "high"): number {
  if (tier === "low") return 3500;
  if (tier === "medium") return 2000;
  return 800;
}

function tierFromScore(scoreBps: number): "low" | "medium" | "high" {
  if (scoreBps < 3500) return "low";
  if (scoreBps < 6500) return "medium";
  return "high";
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "hg-risk-oracle" });
});

app.get("/metrics", async (_req, res) => {
  res.set("content-type", registry.contentType);
  res.send(await registry.metrics());
});

app.post("/v1/risk/score", (req, res) => {
  const input = req.body as RiskInput;
  if (!input?.strategyId) {
    res.status(400).json({ ok: false, error: "strategyId_required" });
    return;
  }

  const { scoreBps, rationale } = computeRiskScore(input);
  const tier = tierFromScore(scoreBps);
  const recommendation: Omit<RiskRecommendation, "signature"> = {
    recommendationId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    strategyId: input.strategyId,
    scoreBps,
    tier,
    maxAllocationBps: maxAllocationFromTier(tier),
    rationale
  };

  const signature = signPayload(JSON.stringify(recommendation));
  const payload: RiskRecommendation = { ...recommendation, signature };

  const filePath = path.join(OUTPUT_DIR, `${recommendation.timestamp.replace(/[:.]/g, "-")}-${recommendation.recommendationId}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });

  totalScored.inc();
  res.status(200).json({ ok: true, recommendation: payload, outputPath: filePath });
});

app.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: "hg-risk-oracle", level: "info", msg: "started", port: PORT }));
  // ── GhostBrain Core registration ───────────────────────────────────────
  void ghostbrainRegister().then(() => ghostbrainStartHeartbeat());
});
