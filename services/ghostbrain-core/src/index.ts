/**
 * GhostBrain Core — Entry point
 *
 * Boots the GhostBrain central autonomous coordination service.
 *
 * Default port : 7900  (GHOSTBRAIN_PORT env to override)
 * Default bind : 127.0.0.1 (GHOSTBRAIN_BIND env to override — set 0.0.0.0 in Docker)
 *
 * Chain-ID env vars (required at runtime for routing-law metric labels):
 *   GHOSTAI_L1_CHAIN_ID  e.g. 14000101
 *   GHOSTAI_L2_CHAIN_ID  e.g. 901
 *   GHOSTAI_L3_CHAIN_ID  e.g. 903
 */

import { buildApp }              from "./app.js";
import { attachWsServer }        from "./routes/ws.js";
import { markReady }             from "./routes/status.js";
import { hydrateAllMemory }      from "./cognition/memory_controller.js";
import { startHypervisorLoop, stopHypervisorLoop } from "./infra/hypervisor_controller.js";
import { startInfraSupervisor, stopInfraSupervisor } from "./infra/infra_supervisor.js";
import { selfRegisterWithCluster } from "./routes/cluster_peer.js";
import { startBrain, stopBrain }   from "./kernel/brain.js";
import { startEventLoop, stopEventLoop } from "./kernel/event_loop.js";
import { startPushLoop, stopPushLoop }   from "./observability/prometheus_gateway.js";
import { startGossip, stopGossip }       from "./cluster/cluster_gossip.js";
import { startSyncLoop, stopSyncLoop }   from "./cluster/cluster_sync.js";
import { startBlockchainAI, stopBlockchainAI } from "./blockchain/ghostchain_ai.js";
import { startValidatorMonitor, stopValidatorMonitor } from "./validators/validator_monitor.js";
import { startValidatorGuardian, stopValidatorGuardian } from "./validators/validator_guardian.js";
import { startRpcMonitor, stopRpcMonitor }   from "./rpc_monitor.js";
import { startHypervisorAI, stopHypervisorAI } from "./hypervisor_ai.js";
import { hydrateGraph } from "./blockchain/memory_graph.js";
import { initPostgres, closePostgres }   from "./db/postgres_client.js";
import { initRedis,    closeRedis }      from "./db/redis_client.js";
import { initQdrant }                    from "./db/qdrant_client.js";
import { hydrateAuditLog }              from "./memory/memory_audit.js";
import { startMemoryOptimizer, stopMemoryOptimizer } from "./core/memory_optimizer.js";
import { startCognitiveLoop, stopCognitiveLoop }     from "./cognition/cognitive_engine.js";
import { startHyperCoreLoop, stopHyperCoreLoop }     from "./hypercore/hypercore_engine.js";
import { startKernelEngine,  stopKernelEngine }       from "./kernel/kernel_engine.js";
import { startSwarmEngine,   stopSwarmEngine }         from "./swarm/swarm_engine.js";

const PORT = Number(process.env.GHOSTBRAIN_PORT ?? "7900");
const BIND = process.env.GHOSTBRAIN_BIND ?? "127.0.0.1";

const app = buildApp();
let wss: ReturnType<typeof attachWsServer> | undefined;

// ── Neural Memory Database — init all three backends (graceful degradation) ──
await initPostgres();
await initRedis();
await initQdrant();

// Hydrate all memory layers from disk before serving traffic
hydrateAllMemory();
hydrateGraph();
hydrateAuditLog();

try {
  await app.listen({ port: PORT, host: BIND });

  // Attach WebSocket server to the same port (path: /ws)
  wss = attachWsServer(app.server);
  markReady();

  // Start autonomous infrastructure observe loop
  startHypervisorLoop();

  // Start GhostBrain Infrastructure Supervisor (predictive AI + self-healing)
  startInfraSupervisor();

  // Start GBA-OS kernel
  startEventLoop();
  await startBrain();
  startPushLoop();
  startGossip();
  startSyncLoop();

  // Non-blocking self-registration with cluster coordinator (if CLUSTER_URL is set)
  void selfRegisterWithCluster();

  // Start blockchain intelligence layer
  startBlockchainAI();
  startValidatorMonitor();
  startValidatorGuardian();
  startRpcMonitor();
  startHypervisorAI();

  // Start neural memory optimizer (periodic compression + archival)
  startMemoryOptimizer();

  // Start cognitive engine — the AI reasoning + planning loop (10 s interval)
  startCognitiveLoop();

  // Start HyperCore — Layer 5 strategic AI loop (15 s interval)
  startHyperCoreLoop();

  // Start AI Kernel Engine — Layer 6 infrastructure control loop (5 s interval)
  startKernelEngine();

  // Start Autonomous Swarm — Layer 7 distributed agent coordination (5 s interval)
  startSwarmEngine();

  app.log.info({ bind: BIND, port: PORT, wsPath: "/ws" }, "ghostbrain-core started");
} catch (err) {
  app.log.error(err, "ghostbrain-core failed to start");
  process.exit(1);
}

process.on("SIGTERM", async () => {
  app.log.info("SIGTERM received — shutting down");
  stopBrain();
  stopPushLoop();
  stopGossip();
  stopSyncLoop();
  stopEventLoop();
  stopHypervisorLoop();
  stopBlockchainAI();
  stopValidatorMonitor();
  stopValidatorGuardian();
  stopRpcMonitor();
  stopHypervisorAI();
  stopMemoryOptimizer();
  stopCognitiveLoop();
  stopHyperCoreLoop();
  stopKernelEngine();
  stopSwarmEngine();
  wss?.close();
  await app.close();
  // Close DB connections last, after HTTP server is down
  await closeRedis();
  await closePostgres();
  process.exit(0);
});

