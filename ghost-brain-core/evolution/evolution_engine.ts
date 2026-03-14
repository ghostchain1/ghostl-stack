/**
 * GhostBrain Self-Evolution Engine — Orchestrator
 *
 * Coordinates the full evolution lifecycle for a single tick:
 *
 *   Memory + Swarm consensus
 *       ↓
 *   EvolutionPlanner   →  EvolutionTask[]
 *       ↓  (for each task, capped at MAX_TASKS_PER_TICK)
 *   SecurityAudit      →  AuditReport
 *   CodeGenerator      →  EvolutionDiff
 *   StabilityCheck     →  StabilityReport
 *   PatchBuilder       →  StagingResult
 *   SandboxRunner      →  SandboxResult  (applies + tests in isolation)
 *   DeployEngine       →  ProposalReceipt  (submitted to signing relay)
 *   ProposalGate       →  final ProposalReceipt  (polls for human ratification)
 *       ↓  (on any failure)
 *   RollbackEngine     →  RollbackResult
 *
 * At NO point does this engine write to the live source tree or submit
 * transactions autonomously.  All changes are proposals; humans ratify them.
 *
 * The orchestrator runs on a configurable interval set by EVOLUTION_INTERVAL_MS
 * (default 60 s).  Each tick produces at most MAX_TASKS_PER_TICK proposals.
 */

import type { MemoryReader }    from "../memory/engine/memory_reader.js";
import type { PatternDetector } from "../memory/learning/pattern_detector.js";
import type { FailurePredictor } from "../memory/learning/failure_predictor.js";
import type { ConsensusActionsPayload } from "../swarm/messaging/event_channel.js";

import { EvolutionPlanner }  from "./planner/evolution_planner.js";
import { CodeGenerator }     from "./generator/code_generator.js";
import { PatchBuilder }      from "./generator/patch_builder.js";
import { SandboxRunner }     from "./testing/sandbox_runner.js";
import { SecurityAudit }     from "./verification/security_audit.js";
import { StabilityCheck }    from "./verification/stability_check.js";
import { DeployEngine }      from "./deployment/deploy_engine.js";
import { RollbackEngine }    from "./deployment/rollback_engine.js";
import { ProposalGate }      from "./governance/proposal_gate.js";
import type {
  EvolutionTask,
  StagingResult,
  ProposalReceipt,
  RollbackResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const EVOLUTION_INTERVAL_MS = parseInt(
  process.env["EVOLUTION_INTERVAL_MS"] ?? "60000", 10,
);

const MAX_TASKS_PER_TICK = parseInt(
  process.env["EVOLUTION_MAX_TASKS_PER_TICK"] ?? "2", 10,
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TickResult {
  tick:      number;
  tasksConsidered: number;
  receipts:  ProposalReceipt[];
  rollbacks: RollbackResult[];
  errors:    string[];
}

// ---------------------------------------------------------------------------
// SelfEvolutionEngine
// ---------------------------------------------------------------------------

export class SelfEvolutionEngine {
  private tick        = 0;
  private running     = false;
  private intervalRef?: ReturnType<typeof setInterval>;

  private readonly planner:    EvolutionPlanner;
  private readonly generator:  CodeGenerator;
  private readonly patcher:    PatchBuilder;
  private readonly sandbox:    SandboxRunner;
  private readonly audit:      SecurityAudit;
  private readonly stability:  StabilityCheck;
  private readonly deployer:   DeployEngine;
  private readonly rollback:   RollbackEngine;
  private readonly gate:       ProposalGate;

  /** Callback invoked after each tick (useful for swarm bus publish). */
  onTick?: (result: TickResult) => void;

  constructor(
    private readonly reader:    MemoryReader,
    private readonly detector:  PatternDetector,
    private readonly predictor: FailurePredictor,
  ) {
    this.planner   = new EvolutionPlanner(reader, detector, predictor);
    this.generator = new CodeGenerator();
    this.patcher   = new PatchBuilder();
    this.sandbox   = new SandboxRunner();
    this.audit     = new SecurityAudit();
    this.stability = new StabilityCheck();
    this.deployer  = new DeployEngine();
    this.rollback  = new RollbackEngine(this.patcher);
    this.gate      = new ProposalGate();
  }

  /** Start the evolution engine on its configured interval. */
  start(getLatestConsensus?: () => ConsensusActionsPayload | undefined): void {
    if (this.running) return;
    this.running = true;

    this.intervalRef = setInterval(async () => {
      try {
        const result = await this.runTick(getLatestConsensus?.());
        this.onTick?.(result);
        console.info(
          `[evolution] tick=${result.tick} tasks=${result.tasksConsidered} ` +
          `proposals=${result.receipts.length} rollbacks=${result.rollbacks.length} ` +
          `errors=${result.errors.length}`,
        );
      } catch (err) {
        console.error("[evolution] unhandled tick error:", err);
      }
    }, EVOLUTION_INTERVAL_MS);
  }

  /** Stop the evolution engine gracefully. */
  stop(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = undefined;
    }
    this.running = false;
  }

  /** Run one evolution tick synchronously (useful for testing). */
  async runTick(consensus?: ConsensusActionsPayload): Promise<TickResult> {
    this.tick++;
    const receipts:  ProposalReceipt[] = [];
    const rollbacks: RollbackResult[]  = [];
    const errors:    string[]          = [];

    // Step 1: plan tasks.
    const allTasks: EvolutionTask[] = this.planner.plan(consensus);
    const tasks = allTasks.slice(0, MAX_TASKS_PER_TICK);

    for (const task of tasks) {
      let stagingPath = "";
      let pendingId   = "";

      try {
        // Step 2: generate the diff.
        const diff = this.generator.generate(task);
        if (!diff) {
          errors.push(`task ${task.id} (${task.kind}): no template available`);
          continue;
        }

        // Step 3: pre-stage security audit — rejects before any disk write.
        const auditReport = this.audit.audit(diff);
        if (!auditReport.approved) {
          const blockers = auditReport.findings
            .filter(f => f.severity === "block")
            .map(f => f.message)
            .join("; ");
          errors.push(`task ${task.id}: audit blocked — ${blockers}`);
          continue;
        }

        // Step 4: check system stability before staging.
        const stabilityReport = await this.stability.check(task.id);
        if (!stabilityReport.stable) {
          errors.push(`task ${task.id}: deferred — system unstable (${stabilityReport.reason})`);
          continue;
        }

        // Step 5: write diff to isolated staging directory.
        const stagingResult: StagingResult = await this.patcher.stage(diff);
        if (!stagingResult.success) {
          errors.push(`task ${task.id}: staging failed — ${stagingResult.error}`);
          continue;
        }
        stagingPath = stagingResult.stagingPath;

        // Step 6: apply diff in isolated sandbox and run tests.
        const sandboxResult = await this.sandbox.run(diff);
        if (!sandboxResult.testReport.passed) {
          errors.push(
            `task ${task.id}: tests failed (exit ${sandboxResult.testReport.exitCode}) — ` +
            sandboxResult.testReport.stderr.slice(0, 200),
          );
          const rb = await this.rollback.rollback(task.id, "", "test failure");
          rollbacks.push(rb);
          continue;
        }

        // Step 7: submit proposal to signing relay (human ratification required).
        const receipt = await this.deployer.submit(
          diff,
          sandboxResult.testReport,
          auditReport,
          stabilityReport,
        );

        if (receipt.status === "rejected") {
          errors.push(`task ${task.id}: relay rejected — ${receipt.error}`);
          const rb = await this.rollback.rollback(task.id, "", "relay rejected");
          rollbacks.push(rb);
          continue;
        }

        pendingId = receipt.relayPendingId;

        // Step 8: wait for governance ratification.
        // This is a long-running poll (up to 24h) — in production the engine
        // runs it in the background rather than blocking the tick.
        // We launch it asynchronously here and capture the receipt immediately.
        this.gate.waitForRatification(receipt).then(final => {
          if (final.status !== "approved") {
            this.rollback
              .rollback(task.id, pendingId, `proposal ${final.status}: ${final.error ?? ""}`)
              .catch(e => console.error("[evolution] rollback error:", e));
          } else {
            // Proposal approved by governance — staging dir can be removed.
            this.patcher.clean(task.id).catch(e =>
              console.error("[evolution] staging cleanup error:", e),
            );
            console.info(
              `[evolution] PROPOSAL APPROVED: task=${task.id} file=${diff.targetFile}`,
            );
          }
        }).catch(e => console.error("[evolution] governance gate error:", e));

        receipts.push(receipt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`task ${task.id}: unexpected error — ${msg}`);

        // Best-effort rollback on unhandled errors.
        if (stagingPath || pendingId) {
          await this.rollback
            .rollback(task.id, pendingId, `unexpected error: ${msg}`)
            .then(rb => rollbacks.push(rb))
            .catch(() => {/* ignore secondary failure */});
        }
      }
    }

    return {
      tick:            this.tick,
      tasksConsidered: tasks.length,
      receipts,
      rollbacks,
      errors,
    };
  }

  get isRunning(): boolean { return this.running; }
  get tickCount():  number { return this.tick; }
}
