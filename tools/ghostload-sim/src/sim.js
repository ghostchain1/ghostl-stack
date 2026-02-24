import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPolicy, validateDecision } from "../../../packages/ghostload-policy/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function loadScenario(name) {
  const scenarioPath = path.join(__dirname, "..", "scenarios", `${name}.json`);
  return JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
}

function chooseFee(policy, layer, actual) {
  const band = policy.feeBands[layer];
  const target = (band.targetMinGwei + band.targetMaxGwei) / 2;
  const deltaBps = clamp(
    Math.round(((target - actual) / Math.max(target, 0.000001)) * 10000),
    -band.maxEpochDeltaBps,
    band.maxEpochDeltaBps
  );
  const valueGwei = clamp(actual * (1 + deltaBps / 10000), band.minGwei, band.maxGwei);
  return { deltaBps, valueGwei };
}

function variance(values) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
}

export function runSimulation({ scenario, policyPath }) {
  const policy = loadPolicy(policyPath || path.join(__dirname, "..", "..", "..", "packages", "ghostload-policy", "default-policy.json"));

  const state = {
    fees: { L1: [], L2: [], L3: [] },
    backlog: [],
    retries: [],
    profitMarginBps: [],
    wastedComputeRatioPct: []
  };

  let backlog = scenario.initial.backlog;
  let retry = scenario.initial.retryRatePct;
  let wasted = scenario.initial.wastedComputeRatioPct;
  let utilization = scenario.initial.utilizationPct;

  for (const tick of scenario.timeline) {
    const currentFees = {
      L1: tick.gasL1,
      L2: tick.gasL2,
      L3: tick.gasL3
    };

    const actions = ["L1", "L2", "L3"].map((layer) => ({
      kind: "fee",
      layer,
      ...chooseFee(policy, layer, currentFees[layer])
    }));

    actions.push({ kind: "route", from: "L3", to: "L2" });
    actions.push({ kind: "route", from: "L2", to: "L1" });

    const decision = {
      id: `${scenario.name}-${tick.epoch}`,
      mode: scenario.mode,
      externalSettlementLayer: "L1",
      actions
    };

    const guard = validateDecision(decision, policy, {
      now: Date.now(),
      metrics: {
        feeVolatilityPct: Math.sqrt(variance(state.fees.L1.concat(state.fees.L2, state.fees.L3))),
        retryRatePct: retry,
        utilizationPct: utilization,
        backlogDepth: backlog
      }
    });
    if (!guard.ok) {
      const defensiveDrain = Math.max(1, Math.floor(tick.drainCapacity * 0.55));
      const defensiveDemand = tick.demandShock > 0 ? Math.ceil(tick.demandShock * 0.7) : tick.demandShock;
      backlog = Math.max(0, backlog + defensiveDemand - defensiveDrain);
      retry = Math.max(0, retry + 0.2);
      wasted = Math.max(0, wasted + 0.15);
      utilization = clamp(utilization + Math.max(-2, tick.utilizationShock * 0.4), 0, 100);
    } else {
      backlog = Math.max(0, backlog + tick.demandShock - tick.drainCapacity);
      retry = Math.max(0, retry + (backlog > scenario.thresholds.backlogWarn ? 0.3 : -0.2));
      wasted = Math.max(0, wasted + (retry > scenario.thresholds.retryWarn ? 0.2 : -0.15));
      utilization = clamp(utilization + tick.utilizationShock, 0, 100);
    }

    const settlementCost = tick.gasL1 * tick.settlementUnits * 0.08;
    const blendedFee = (actions[1].valueGwei + actions[2].valueGwei + actions[0].valueGwei * 0.2) / 2.2;
    const revenue = tick.userFeeUnits * blendedFee * 120;
    const infra = tick.infraCostUnits * 0.9;
    const marginBps = revenue <= 0 ? 0 : ((revenue - settlementCost - infra) / revenue) * 10000;

    state.backlog.push(backlog);
    state.retries.push(retry);
    state.wastedComputeRatioPct.push(wasted);
    state.profitMarginBps.push(marginBps);
    for (const layer of ["L1", "L2", "L3"]) {
      const action = actions.find((a) => a.layer === layer);
      state.fees[layer].push(action.valueGwei);
    }
  }

  const backlogPeak = Math.max(...state.backlog);
  const finalBacklog = state.backlog[state.backlog.length - 1] || 0;
  const recoveryTicks = state.backlog.findIndex((v) => v <= scenario.thresholds.recoveryBacklogTarget);

  const result = {
    scenario: scenario.name,
    mode: scenario.mode,
    feeVolatilityPct: {
      L1: Math.sqrt(variance(state.fees.L1)),
      L2: Math.sqrt(variance(state.fees.L2)),
      L3: Math.sqrt(variance(state.fees.L3))
    },
    backlogPeak,
    finalBacklog,
    recoveryTicks: recoveryTicks < 0 ? null : recoveryTicks,
    retryRatePctAvg: state.retries.reduce((a, b) => a + b, 0) / state.retries.length,
    wastedComputeRatioPctAvg: state.wastedComputeRatioPct.reduce((a, b) => a + b, 0) / state.wastedComputeRatioPct.length,
    profitMarginBpsMin: Math.min(...state.profitMarginBps),
    acceptance: {
      volatilityReduced: Math.sqrt(variance(state.fees.L2)) <= scenario.thresholds.maxL2Volatility,
      backlogRecovered: finalBacklog <= scenario.thresholds.maxFinalBacklog,
      profitFloorHeld: Math.min(...state.profitMarginBps) >= scenario.thresholds.minProfitFloorBps,
      energyImproved: state.wastedComputeRatioPct[state.wastedComputeRatioPct.length - 1] <= scenario.thresholds.maxWastedComputePct
    }
  };

  result.acceptance.allPassed = Object.values(result.acceptance).every(Boolean);
  return result;
}
