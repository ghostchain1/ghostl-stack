import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPolicy, validatePolicy, validateDecision } from "../../../packages/ghostload-policy/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadValidatedPolicy(policyPath) {
  const resolved = policyPath || path.join(__dirname, "..", "..", "..", "packages", "ghostload-policy", "default-policy.json");
  const policy = loadPolicy(resolved);
  const validation = validatePolicy(policy);
  if (!validation.ok) {
    throw new Error(`invalid ghostload policy: ${validation.errors.join("; ")}`);
  }
  return policy;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function midpoint(min, max) {
  return min + (max - min) / 2;
}

export function buildDecision(metrics, policy, context) {
  const now = Date.now();
  const mode = context.mode || "stability-first";
  const actions = [];

  for (const layer of ["L1", "L2", "L3"]) {
    const band = policy.feeBands[layer];
    const actual = Number(metrics?.layers?.[layer]?.gasGwei ?? midpoint(band.targetMinGwei, band.targetMaxGwei));
    const target = midpoint(band.targetMinGwei, band.targetMaxGwei);
    const rawDeltaBps = Math.round(((target - actual) / Math.max(target, 0.000001)) * 10000);
    const deltaBps = clamp(rawDeltaBps, -band.maxEpochDeltaBps, band.maxEpochDeltaBps);
    const valueGwei = clamp(actual * (1 + deltaBps / 10000), band.minGwei, band.maxGwei);

    actions.push({
      kind: "fee",
      layer,
      param: `${layer}.baseFee`,
      deltaBps,
      valueGwei: Number(valueGwei.toFixed(9))
    });
  }

  actions.push({
    kind: "throughput",
    layer: "L3",
    minRps: 10,
    maxRps: Number(metrics?.layers?.L3?.utilizationPct ?? 50) > 85 ? 40 : 80
  });

  actions.push({ kind: "route", from: "L3", to: "L2" });
  actions.push({ kind: "route", from: "L2", to: "L1" });

  const plan = {
    id: crypto.randomUUID(),
    generatedAt: new Date(now).toISOString(),
    mode,
    externalSettlementLayer: "L1",
    actions
  };

  const guard = validateDecision(plan, policy, {
    now,
    lastAppliedAt: context.lastAppliedAt,
    metrics: {
      feeVolatilityPct: Number(metrics?.global?.feeVolatilityPct ?? 0),
      retryRatePct: Number(metrics?.global?.retryRatePct ?? 0),
      utilizationPct: Number(metrics?.global?.utilizationPct ?? 0),
      backlogDepth: Number(metrics?.global?.backlogDepth ?? 0)
    }
  });

  return {
    decision: plan,
    guard
  };
}

export function fallbackDecision(policy, reason) {
  return {
    id: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    mode: "lockdown",
    fallback: true,
    reason,
    externalSettlementLayer: "L1",
    actions: [
      { kind: "route", from: "L3", to: "L2" },
      { kind: "route", from: "L2", to: "L1" },
      {
        kind: "throughput",
        layer: "L3",
        minRps: 5,
        maxRps: 25
      },
      ...["L1", "L2", "L3"].map((layer) => {
        const band = policy.feeBands[layer];
        return {
          kind: "fee",
          layer,
          param: `${layer}.baseFee`,
          deltaBps: 0,
          valueGwei: midpoint(band.targetMinGwei, band.targetMaxGwei)
        };
      })
    ]
  };
}
