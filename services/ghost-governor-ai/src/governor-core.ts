/**
 * Governor Core
 *
 * Orchestrates the full autonomous economic governance loop:
 *
 *   1. analyzeNetwork       — snapshot all chains, validators, liquidity, treasury
 *   2. detectRisk           — check for critical anomalies (runs first; may halt other modules)
 *   3. manageValidators     — penalise/reward signals based on performance
 *   4. manageTreasury       — invest/buyback signals based on balance
 *   5. manageLiquidity      — inject/withdraw signals based on reserve ratios
 *   6. adjustFees           — fee floor/ceiling proposals
 *   7. processGovernance    — quorum-reached on-chain proposal signals
 *
 * All generated proposals are logged. If GOVERNOR_DRY_RUN=false, they are
 * also submitted to the governance bridge for human ratification queuing.
 *
 * Per GhostChain governance rules: AI may PROPOSE; humans must RATIFY.
 * No autonomous on-chain execution without governance quorum.
 */
import { randomUUID }     from "node:crypto";
import { analyzeNetwork } from "./analyzers/network-analyzer.js";
import { detectRisk }     from "./modules/risk-manager.js";
import { manageValidators } from "./modules/validator-manager.js";
import { manageTreasury } from "./modules/treasury-manager.js";
import { manageLiquidity, incrementCycle } from "./modules/liquidity-manager.js";
import { adjustFees }     from "./modules/fee-manager.js";
import { processGovernance } from "./modules/governance-manager.js";
import { ECONOMIC_POLICY } from "./policies/economic-policy.js";
import { recordCycle, setRunning, DRY_RUN } from "./state.js";
import type { GovernorCycle, GovernorProposal } from "./types.js";

const GOVERNANCE_BRIDGE_URL =
  process.env.GOVERNANCE_BRIDGE_URL ?? "http://127.0.0.1:7685";

let active = false;

// ---------------------------------------------------------------------------
// Proposal submission (non-dry-run)
// ---------------------------------------------------------------------------

async function submitProposal(proposal: GovernorProposal): Promise<void> {
  if (DRY_RUN) return;

  try {
    await fetch(`${GOVERNANCE_BRIDGE_URL}/api/v1/proposals`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(proposal),
      signal:  AbortSignal.timeout(4_000),
    });
  } catch {
    // Bridge unavailable — non-critical, proposal is already logged
  }
}

// ---------------------------------------------------------------------------
// Single governor cycle
// ---------------------------------------------------------------------------

async function runCycle(): Promise<GovernorCycle> {
  const cycleId   = randomUUID();
  const startTime = Date.now();

  const cycle: GovernorCycle = {
    cycleId,
    startTime,
    proposals: [],
    errors:    [],
    status:    "running",
  };

  console.log(`[governor] cycle ${cycleId} started`);

  incrementCycle();

  try {
    const network = await analyzeNetwork();

    // Risk check runs first — critical events can halt non-critical modules
    const riskResult = await detectRisk(network).catch(err => {
      cycle.errors.push(`risk-manager: ${String(err)}`);
      return { proposals: [] as GovernorProposal[], critical: false };
    });

    cycle.proposals.push(...riskResult.proposals);

    if (!riskResult.critical) {
      // Run all non-critical modules in parallel
      const [validatorP, treasuryP, liquidityP, feesP, govP] = await Promise.all([
        manageValidators(network).catch(err => {
          cycle.errors.push(`validator-manager: ${String(err)}`);
          return [] as GovernorProposal[];
        }),
        manageTreasury(network).catch(err => {
          cycle.errors.push(`treasury-manager: ${String(err)}`);
          return [] as GovernorProposal[];
        }),
        manageLiquidity(network).catch(err => {
          cycle.errors.push(`liquidity-manager: ${String(err)}`);
          return [] as GovernorProposal[];
        }),
        adjustFees(network).catch(err => {
          cycle.errors.push(`fee-manager: ${String(err)}`);
          return [] as GovernorProposal[];
        }),
        processGovernance().catch(err => {
          cycle.errors.push(`governance-manager: ${String(err)}`);
          return [] as GovernorProposal[];
        }),
      ]);

      cycle.proposals.push(...validatorP, ...treasuryP, ...liquidityP, ...feesP, ...govP);
    } else {
      cycle.errors.push("Non-critical modules skipped: critical risk detected.");
    }

    // Submit proposals to governance bridge
    await Promise.all(cycle.proposals.map(p => submitProposal(p)));

    cycle.status = "completed";

  } catch (err) {
    cycle.errors.push(`cycle-fatal: ${String(err)}`);
    cycle.status = "failed";
  }

  cycle.endTime = Date.now();

  console.log(
    `[governor] cycle ${cycleId} ${cycle.status} — ${cycle.proposals.length} proposals, ` +
    `${cycle.errors.length} errors, ${cycle.endTime - cycle.startTime}ms`
  );

  if (cycle.proposals.length > 0) {
    for (const p of cycle.proposals) {
      console.log(`  [proposal] ${p.type} (${p.risk}): ${p.description.slice(0, 80)}...`);
    }
  }

  recordCycle(cycle);
  return cycle;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runGovernor(): Promise<void> {
  active = true;
  setRunning(true);

  console.log(
    `[governor] GhostChain Sovereign AI Network Governor started. ` +
    `DRY_RUN=${DRY_RUN}, cycle=${ECONOMIC_POLICY.CYCLE_INTERVAL_MS / 1000}s`
  );

  while (active) {
    await runCycle();

    if (active) {
      await new Promise<void>(res => setTimeout(res, ECONOMIC_POLICY.CYCLE_INTERVAL_MS));
    }
  }

  setRunning(false);
  console.log("[governor] stopped.");
}

export function stopGovernor(): void {
  active = false;
}
