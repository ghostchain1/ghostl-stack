import fs from "node:fs";

const LAYERS = new Set(["L1", "L2", "L3"]);

export function loadPolicy(policyPath) {
  return JSON.parse(fs.readFileSync(policyPath, "utf8"));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numberInRange(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function validatePolicy(policy) {
  const errors = [];
  if (!isObject(policy)) return { ok: false, errors: ["policy must be an object"] };

  if (!policy.version) errors.push("version is required");
  if (!isObject(policy.routingLaw)) errors.push("routingLaw is required");
  if (!isObject(policy.feeBands)) errors.push("feeBands is required");
  if (!isObject(policy.objectives)) errors.push("objectives is required");
  if (!isObject(policy.energyPolicy)) errors.push("energyPolicy is required");
  if (!Array.isArray(policy.criticalParameters)) errors.push("criticalParameters must be array");
  if (!isObject(policy.emergencyModes)) errors.push("emergencyModes is required");
  if (!isObject(policy.featureFlags)) errors.push("featureFlags is required");

  if (isObject(policy.routingLaw)) {
    const paths = policy.routingLaw.allowedPaths;
    if (!Array.isArray(paths) || paths.length === 0) {
      errors.push("routingLaw.allowedPaths must be non-empty array");
    } else {
      for (const path of paths) {
        if (!Array.isArray(path) || path.length !== 2) {
          errors.push("each allowed path must have exactly [from,to]");
          continue;
        }
        const [from, to] = path;
        if (!LAYERS.has(from) || !LAYERS.has(to)) errors.push(`invalid layer pair ${from}->${to}`);
      }
    }
    if (policy.routingLaw.externalSettlementLayer !== "L1") {
      errors.push("external settlement layer must be L1");
    }
  }

  for (const layer of ["L1", "L2", "L3"]) {
    const band = policy?.feeBands?.[layer];
    if (!isObject(band)) {
      errors.push(`feeBands.${layer} missing`);
      continue;
    }
    if (!numberInRange(band.minGwei, 0, Number.MAX_SAFE_INTEGER)) errors.push(`${layer}.minGwei invalid`);
    if (!numberInRange(band.maxGwei, 0, Number.MAX_SAFE_INTEGER)) errors.push(`${layer}.maxGwei invalid`);
    if (!numberInRange(band.targetMinGwei, 0, Number.MAX_SAFE_INTEGER)) errors.push(`${layer}.targetMinGwei invalid`);
    if (!numberInRange(band.targetMaxGwei, 0, Number.MAX_SAFE_INTEGER)) errors.push(`${layer}.targetMaxGwei invalid`);
    if (!numberInRange(band.maxEpochDeltaBps, 0, 10000)) errors.push(`${layer}.maxEpochDeltaBps invalid`);
    if (!numberInRange(band.cooldownSeconds, 0, Number.MAX_SAFE_INTEGER)) errors.push(`${layer}.cooldownSeconds invalid`);
    if (band.minGwei > band.maxGwei) errors.push(`${layer} minGwei > maxGwei`);
    if (band.targetMinGwei > band.targetMaxGwei) errors.push(`${layer} targetMinGwei > targetMaxGwei`);
    if (band.targetMinGwei < band.minGwei || band.targetMaxGwei > band.maxGwei) {
      errors.push(`${layer} target band must stay inside hard band`);
    }
  }

  if (!numberInRange(policy?.objectives?.targetUtilizationPct, 1, 100)) {
    errors.push("objectives.targetUtilizationPct invalid");
  }
  if (!numberInRange(policy?.objectives?.profitFloorBps, 0, 10000)) {
    errors.push("objectives.profitFloorBps invalid");
  }
  if (!numberInRange(policy?.objectives?.maxSustainedUtilizationPct, 1, 100)) {
    errors.push("objectives.maxSustainedUtilizationPct invalid");
  }

  if (!numberInRange(policy?.energyPolicy?.maxRetryRatePct, 0, 100)) errors.push("energyPolicy.maxRetryRatePct invalid");
  if (!numberInRange(policy?.energyPolicy?.maxWastedComputeRatioPct, 0, 100)) errors.push("energyPolicy.maxWastedComputeRatioPct invalid");
  if (!numberInRange(policy?.energyPolicy?.minCompressionRatio, 1, Number.MAX_SAFE_INTEGER)) {
    errors.push("energyPolicy.minCompressionRatio invalid");
  }

  return { ok: errors.length === 0, errors };
}

export function classifyChange(path, policy) {
  return policy.criticalParameters.includes(path) ? "critical" : "bounded";
}

export function enforceRoutingLaw(plan, policy) {
  const errors = [];
  const allowed = new Set(policy.routingLaw.allowedPaths.map((p) => `${p[0]}->${p[1]}`));
  const routeActions = (plan.actions || []).filter((a) => a.kind === "route");
  for (const action of routeActions) {
    const edge = `${action.from}->${action.to}`;
    if (!allowed.has(edge)) {
      errors.push(`routing violation: ${edge} not allowed`);
    }
    if (action.from === "L3" && action.to === "L1") {
      errors.push("L3->L1 direct route forbidden");
    }
    if (action.from === "L2" && action.to === "EXTERNAL") {
      errors.push("L2 direct external route forbidden");
    }
  }
  if (plan.externalSettlementLayer && plan.externalSettlementLayer !== "L1") {
    errors.push("external settlement must happen on L1 only");
  }
  return { ok: errors.length === 0, errors };
}

function validateFeeAction(action, policy, context, errors) {
  const band = policy.feeBands[action.layer];
  if (!band) {
    errors.push(`unknown layer ${action.layer}`);
    return;
  }
  if (!numberInRange(action.valueGwei, band.minGwei, band.maxGwei)) {
    errors.push(`${action.layer} valueGwei ${action.valueGwei} out of hard band`);
  }
  if (!numberInRange(action.deltaBps, -band.maxEpochDeltaBps, band.maxEpochDeltaBps)) {
    errors.push(`${action.layer} deltaBps ${action.deltaBps} above maxEpochDeltaBps`);
  }

  const lastAppliedAt = context?.lastAppliedAt?.[action.layer] ?? 0;
  const now = context?.now ?? Date.now();
  const elapsed = Math.floor((now - lastAppliedAt) / 1000);
  if (lastAppliedAt > 0 && elapsed < band.cooldownSeconds) {
    errors.push(`${action.layer} cooldown active: ${elapsed}s < ${band.cooldownSeconds}s`);
  }
}

export function quickImpactSimulation(plan, metrics = {}) {
  const volatilityNow = Number(metrics.feeVolatilityPct ?? 0);
  const backlogNow = Number(metrics.backlogDepth ?? 0);
  const retryRateNow = Number(metrics.retryRatePct ?? 0);
  const utilizationNow = Number(metrics.utilizationPct ?? 0);

  const avgAbsDelta = (plan.actions || [])
    .filter((a) => a.kind === "fee")
    .map((a) => Math.abs(Number(a.deltaBps ?? 0)))
    .reduce((a, b, _, arr) => a + b / (arr.length || 1), 0);

  const projected = {
    feeVolatilityPct: Math.max(0, volatilityNow - Math.min(avgAbsDelta / 250, 2.5)),
    backlogDepth: Math.max(0, backlogNow + (utilizationNow > 90 ? 3 : -2)),
    retryRatePct: Math.max(0, retryRateNow - 0.25),
    riskScore: Math.min(1, (volatilityNow / 20) + (retryRateNow / 20) + (utilizationNow / 100))
  };

  return projected;
}

export function validateDecision(plan, policy, context = {}) {
  const errors = [];
  if (!plan || !Array.isArray(plan.actions)) {
    return { ok: false, errors: ["plan.actions must be array"] };
  }

  for (const action of plan.actions) {
    if (action.kind === "fee") {
      validateFeeAction(action, policy, context, errors);
    }
    if (action.kind === "throughput" && Number(action.minRps ?? 0) <= 0) {
      errors.push("throughput.minRps must stay positive to preserve liveness");
    }
  }

  const routing = enforceRoutingLaw(plan, policy);
  errors.push(...routing.errors);

  const impact = quickImpactSimulation(plan, context.metrics || {});
  if (impact.riskScore > 0.92) {
    errors.push(`impact simulation risk too high (${impact.riskScore.toFixed(3)})`);
  }

  return { ok: errors.length === 0, errors, impact };
}
