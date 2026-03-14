/**
 * Multichain Controller Core
 *
 * Autonomous monitoring loop — runs continuously at CYCLE_INTERVAL_MS (default 20s).
 *
 * Each cycle:
 *   1. analyzeCrosschain()      — snapshot all external chains + bridge/pool/market state
 *   2. modules run in parallel  — bridge-manager, liquidity-router, arbitrage-engine,
 *                                  oracle-manager, crosschain-validator
 *   3. recordCycle()            — persist results for HTTP status endpoint
 *   4. sleep → next cycle
 *
 * Sovereignty: all cross-chain routes are validated by sovereignty-policy before
 * any action is generated. L2 and L3 never appear as originators of external routes.
 */
import { randomUUID }            from "node:crypto";
import { analyzeCrosschain }     from "./analyzers/crosschain-analyzer.js";
import { manageBridges }         from "./modules/bridge-manager.js";
import { routeLiquidity }        from "./modules/liquidity-router.js";
import { runArbitrage }          from "./modules/arbitrage-engine.js";
import { updateOracles }         from "./modules/oracle-manager.js";
import { runCrosschainValidator } from "./modules/crosschain-validator.js";
import { BRIDGE_POLICY }         from "./policies/bridge-policy.js";
import { recordCycle, setRunning, DRY_RUN, ALLOW_AUTO_EXEC } from "./state.js";
import type { MultichainCycle }  from "./types.js";

let active = false;

// ---------------------------------------------------------------------------
// Single cycle execution
// ---------------------------------------------------------------------------

async function runCycle(): Promise<MultichainCycle> {
  const cycleId   = randomUUID();
  const startTime = Date.now();

  const cycle: MultichainCycle = {
    cycleId,
    startTime,
    actions:  [],
    executed: [],
    errors:   [],
    status:   "running",
  };

  console.log(`[multichain-controller] cycle ${cycleId} started`);

  try {
    const state = await analyzeCrosschain();

    // All modules are independent and read from the pre-snapped state — run in parallel
    const [bridgeA, liquidityA, arbitrageA, oracleA, validatorA] = await Promise.all([
      manageBridges(state).catch(err => { cycle.errors.push(`bridge-manager: ${String(err)}`); return []; }),
      routeLiquidity(state).catch(err => { cycle.errors.push(`liquidity-router: ${String(err)}`); return []; }),
      runArbitrage(state).catch(err => { cycle.errors.push(`arbitrage-engine: ${String(err)}`); return []; }),
      updateOracles(state).catch(err => { cycle.errors.push(`oracle-manager: ${String(err)}`); return []; }),
      Promise.resolve(runCrosschainValidator(state)),
    ]);

    cycle.actions.push(...bridgeA, ...liquidityA, ...arbitrageA, ...oracleA, ...validatorA);

    // Track auto-executed actions (oracle_update with ALLOW_AUTO_EXEC)
    cycle.executed = cycle.actions
      .filter(a => !a.requiresRatification && a.params["executed"] === true)
      .map(a => a.id);

    cycle.status = "completed";
  } catch (err) {
    cycle.errors.push(`cycle-fatal: ${String(err)}`);
    cycle.status = "failed";
  }

  cycle.endTime = Date.now();

  // Log cycle summary
  console.log(
    `[multichain-controller] cycle ${cycleId} ${cycle.status} — ` +
    `${cycle.actions.length} actions (${cycle.executed.length} auto-executed), ` +
    `${cycle.errors.length} errors, ${cycle.endTime - cycle.startTime}ms`,
  );

  for (const a of cycle.actions) {
    const tag = a.requiresRatification ? " [RATIFICATION_REQUIRED]" : " [AUTO]";
    console.log(
      `  [action] ${a.type}@${a.sourceChain}→${a.destChain} (${a.risk})${tag}: ` +
      a.description.slice(0, 100),
    );
  }

  recordCycle(cycle);
  return cycle;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runMultichainController(): Promise<void> {
  active = true;
  setRunning(true);

  console.log(
    `[multichain-controller] GhostChain Autonomous Multichain Controller started. ` +
    `DRY_RUN=${DRY_RUN}, ALLOW_AUTO_EXEC=${ALLOW_AUTO_EXEC}, ` +
    `cycle=${BRIDGE_POLICY.CYCLE_INTERVAL_MS / 1_000}s`,
  );

  while (active) {
    await runCycle();
    if (active) {
      await new Promise<void>(res => setTimeout(res, BRIDGE_POLICY.CYCLE_INTERVAL_MS));
    }
  }

  setRunning(false);
  console.log("[multichain-controller] stopped.");
}

export function stopMultichainController(): void {
  active = false;
}
