/**
 * Ghost AI Swarm Controller
 * Registers all 7 agents on the swarm bus and starts the periodic tick.
 */
import { builderAgent }    from "../agents/builder-agent";
import { auditorAgent }    from "../agents/auditor-agent";
import { defenderAgent }   from "../agents/defender-agent";
import { optimizerAgent }  from "../agents/optimizer-agent";
import { infraAgent }      from "../agents/infra-agent";
import { governanceAgent } from "../agents/governance-agent";
import { treasuryAgent }   from "../agents/treasury-agent";
import { swarmBus }        from "../communication/swarm-bus";
import { SWARM_EVENTS_TOTAL } from "../metrics";

const TICK_INTERVAL_MS = parseInt(
  process.env["GHOST_SWARM_TICK_INTERVAL_MS"] ?? "60000",
  10
);

let _started = false;
let _tickTimer: ReturnType<typeof setInterval> | null = null;

export function startSwarm(): void {
  if (_started) return;
  _started = true;

  // Register all agents
  builderAgent();
  auditorAgent();
  defenderAgent();
  optimizerAgent();
  infraAgent();
  governanceAgent();
  treasuryAgent();

  // Periodic health tick — emits optimize-system to keep the optimizer warm
  _tickTimer = setInterval(() => {
    SWARM_EVENTS_TOTAL.inc({ event: "optimize-system" });
    swarmBus.emit("optimize-system", {});
  }, TICK_INTERVAL_MS);

  // Prevent the timer from blocking process exit in tests
  if (_tickTimer.unref) _tickTimer.unref();

  console.log(
    `👻 Ghost AI Swarm started — 7 agents active, tick every ${TICK_INTERVAL_MS / 1000}s`
  );
}

export function stopSwarm(): void {
  if (_tickTimer) {
    clearInterval(_tickTimer);
    _tickTimer = null;
  }
  _started = false;
}

export function isStarted(): boolean {
  return _started;
}
