/**
 * GhostBrain Autonomous Operations Engine — Main Entry Point (Phase 42)
 *
 * GOVERNANCE MODEL (non-negotiable)
 * ──────────────────────────────────
 *   This service is DETECT-AND-PROPOSE only.
 *   The loop runs monitor modules, feeds detections to the decision engine,
 *   and dispatches action modules that POST proposals to the signing relay
 *   (SIGNING_RELAY_URL, default port 7910).
 *
 *   A HUMAN must Approve every proposal before the relay executes anything.
 *   No autonomous writes are issued from this process.
 *
 * Health API
 * ───────────
 *   GET /health  — liveness + stats
 *   GET /status  — current proposal queue + strategy snapshot
 *
 * Port: GHOSTAUTO_PORT (default 7921)
 *
 * Env flags
 * ─────────
 *   DRY_RUN=1            log proposals, skip relay POSTs
 *   POLL_INTERVAL_MS     detection loop interval (default 30 000 ms)
 *   GHOSTAUTO_PORT       health API port (default 7921)
 *   SIGNING_RELAY_URL    where proposals are forwarded
 *   GHOSTSTACK_API_BASE  BFF base URL (default http://localhost:3000)
 */

import http from "node:http";
import { CONFIG } from "./config/rules.js";
import { monitorValidators }    from "./monitor/validatorMonitor.js";
import { monitorChains }        from "./monitor/chainMonitor.js";
import { monitorInfrastructure } from "./monitor/infraMonitor.js";
import { decide }               from "./ai/decisionEngine.js";
import { strategy }             from "./ai/strategyEngine.js";
import { restartValidator }     from "./actions/restartValidator.js";
import { rebalanceValidators }  from "./actions/rebalanceValidators.js";
import { treasuryStrategy }     from "./actions/treasuryStrategy.js";
import { scaleInfrastructure }  from "./actions/scaleInfrastructure.js";
import type { Proposal }        from "./types.js";

// ── State ───────────────────────────────────────────────────────────────────

const MAX_RECENT = 200;

const state = {
  running:            false,
  cycleCount:         0,
  proposalsSent:      0,
  proposalsFailed:    0,
  proposalsDryRun:    0,
  lastCycleAt:        null as string | null,
  lastCycleDurationMs:0,
  recentProposals:    [] as Proposal[],
  latestStrategy:     strategy(),
};

function pushProposals(proposals: Proposal[]) {
  state.recentProposals.unshift(...proposals);
  if (state.recentProposals.length > MAX_RECENT) {
    state.recentProposals.length = MAX_RECENT;
  }
  for (const p of proposals) {
    if (p.status === "sent")        state.proposalsSent++;
    else if (p.status === "send_failed") state.proposalsFailed++;
    else if (p.status === "dry_run")     state.proposalsDryRun++;
  }
}

// ── Core detection-dispatch loop ─────────────────────────────────────────────

async function runCycle(): Promise<void> {
  const cycleStart = Date.now();
  state.cycleCount++;

  console.log(`[autonomous] cycle #${state.cycleCount} — collecting detections`);

  // ── Phase 43-45: collect all raw proposals from monitors ─────────────────
  const [validatorRaw, chainRaw, infraRaw] = await Promise.allSettled([
    monitorValidators(),
    monitorChains(),
    monitorInfrastructure(),
  ]);

  const rawProposals: Proposal[] = [
    ...(validatorRaw.status === "fulfilled" ? validatorRaw.value : []),
    ...(chainRaw.status    === "fulfilled" ? chainRaw.value    : []),
    ...(infraRaw.status    === "fulfilled" ? infraRaw.value    : []),
  ];

  console.log(`[autonomous] cycle #${state.cycleCount} — ${rawProposals.length} raw detection(s)`);

  // ── Phase 50: decision engine — deduplicate and prioritise ───────────────
  const { toForward, suppressed, strategySnapshot } = decide(rawProposals);
  state.latestStrategy = strategySnapshot as typeof state.latestStrategy;

  if (suppressed.length > 0) {
    console.log(`[autonomous] ${suppressed.length} proposal(s) suppressed (dedup/below-threshold)`);
  }

  // ── Phase 46-49: dispatch action modules for proposals to forward ─────────
  const dispatched: Proposal[] = [];

  for (const p of toForward) {
    let result: Proposal;

    switch (p.type) {
      case "restart_validator":
        result = await restartValidator(p);
        break;

      case "rebalance_validators":
        result = await rebalanceValidators(p);
        break;

      // Alert-only types — mark sent without a separate action module call
      case "alert_chain_stale":
      case "alert_container_down":
      case "alert_liquidity_imbalance":
      case "alert_validator_jailed": {
        if (!CONFIG.dryRun) {
          // Forward alert proposal directly to signing relay for audit trail
          try {
            const r = await globalThis.fetch(`${CONFIG.signingRelayUrl}/proposals`, {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ ...p, requestedBy: "ghostbrain-autonomous" }),
              signal:  AbortSignal.timeout(8_000),
            });
            result = { ...p, status: r.ok ? "sent" : "send_failed" };
          } catch {
            result = { ...p, status: "send_failed" };
          }
        } else {
          result = { ...p, status: "dry_run" };
        }
        break;
      }

      default:
        result = p;
    }

    dispatched.push(result);
  }

  // ── Phase 48-49: run treasury and scale checks independently ─────────────
  const [treasuryResult, scaleResult] = await Promise.allSettled([
    treasuryStrategy(),
    scaleInfrastructure(),
  ]);

  if (treasuryResult.status === "fulfilled" && treasuryResult.value !== null) {
    dispatched.push(treasuryResult.value);
  }
  if (scaleResult.status === "fulfilled" && scaleResult.value !== null) {
    dispatched.push(scaleResult.value);
  }

  if (dispatched.length > 0) {
    pushProposals(dispatched);
  }

  state.lastCycleAt        = new Date().toISOString();
  state.lastCycleDurationMs = Date.now() - cycleStart;

  console.log(
    `[autonomous] cycle #${state.cycleCount} complete in ${state.lastCycleDurationMs}ms ` +
    `— forwarded ${dispatched.filter(p => p.status === "sent").length} proposal(s) to relay`,
  );
}

// ── Autonomous loop (Phase 42) ───────────────────────────────────────────────

async function autonomousLoop(): Promise<void> {
  console.log(
    `GhostBrain Autonomous Engine Running\n` +
    `  poll interval : ${CONFIG.pollIntervalMs}ms\n` +
    `  signing relay : ${CONFIG.signingRelayUrl}\n` +
    `  api base      : ${CONFIG.apiBase}\n` +
    `  dry_run       : ${CONFIG.dryRun}\n` +
    `  health port   : ${CONFIG.healthPort}`,
  );

  state.running = true;

  // Run the first cycle immediately, then on interval
  await runCycle();

  // eslint-disable-next-line no-constant-condition
  while (state.running) {
    await new Promise<void>(resolve => setTimeout(resolve, CONFIG.pollIntervalMs));
    await runCycle();
  }
}

// ── Health API (Phase 54) ─────────────────────────────────────────────────────

function startHealthServer(): void {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");

    if (req.url === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({
        ok:      true,
        service: "ghostbrain-autonomous",
        running: state.running,
        dryRun:  CONFIG.dryRun,
        cycleCount: state.cycleCount,
        lastCycleAt: state.lastCycleAt,
      }));
      return;
    }

    if (req.url === "/status") {
      res.writeHead(200);
      res.end(JSON.stringify({
        cycleCount:          state.cycleCount,
        proposalsSent:       state.proposalsSent,
        proposalsFailed:     state.proposalsFailed,
        proposalsDryRun:     state.proposalsDryRun,
        lastCycleAt:         state.lastCycleAt,
        lastCycleDurationMs: state.lastCycleDurationMs,
        strategy:            state.latestStrategy,
        recentProposals:     state.recentProposals.slice(0, 50),
      }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.listen(CONFIG.healthPort, () => {
    console.log(`[autonomous] health API listening on port ${CONFIG.healthPort}`);
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

startHealthServer();

autonomousLoop().catch(err => {
  console.error("[autonomous] fatal error in autonomous loop:", err);
  process.exit(1);
});
