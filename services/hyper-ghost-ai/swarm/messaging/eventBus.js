/**
 * @file swarm/messaging/eventBus.js
 * @description GhostStack AI Swarm — Singleton EventEmitter message bus.
 *
 * All swarm agents, the orchestrator, and the intelligence modules communicate
 * exclusively through this bus.  No module may call another module's functions
 * directly — all coupling is event-based.
 *
 * Standard event name convention:
 *   anomaly:<domain>    — emitted by anomalyDetection / predictionEngine
 *   prediction:<topic>  — emitted by predictionEngine
 *   swarm:proposal      — emitted by agents → consumed by swarmController
 *   swarm:action        — emitted by swarmController after persisting a proposal
 *   swarm:started       — emitted once on boot
 *   swarm:error         — unhandled agent errors (never crashes the process)
 */

import { EventEmitter } from 'node:events';

export const swarmBus = new EventEmitter();

// 6 agents + orchestrator + 2 intelligence modules + 5 headroom
swarmBus.setMaxListeners(50);

// Global safety: unhandled 'error' events on the bus must not crash the process
swarmBus.on('error', (err) => {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'swarmBus-error', error: String(err) }) + '\n'
  );
});
