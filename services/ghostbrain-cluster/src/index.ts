/**
 * GhostBrain Cluster — Entry Point
 *
 * Federated AI coordination hub: gossip, leader election, workload sync.
 *
 * Default port : 7902  (CLUSTER_PORT env)
 * Default bind : 127.0.0.1 (CLUSTER_BIND env — set 0.0.0.0 in multi-host Docker)
 *
 * Required env:
 *   CLUSTER_NODE_ID   — unique identifier for this cluster node
 *   CLUSTER_NODE_URL  — reachable URL of this node (for peer announcements)
 *   CLUSTER_PEERS     — comma-separated peer URLs to seed (may be empty for single-node)
 *
 * Optional env:
 *   MEMORY_URL   — ghostbrain-memory service URL (default: empty, sync disabled)
 *   INFRA_URL    — ghostbrain-infra service URL  (default: empty, sync disabled)
 */

import { buildApp }          from "./app.js";
import { seedPeersFromEnv }  from "./cluster_node.js";
import { startGossipLoop, stopGossipLoop } from "./cluster_gossip.js";
import { startConsensusLoop, stopConsensusLoop } from "./cluster_consensus.js";
import { startSyncLoop, stopSyncLoop } from "./cluster_sync.js";

const PORT = Number(process.env.CLUSTER_PORT ?? "7902");
const BIND = process.env.CLUSTER_BIND ?? "127.0.0.1";

const app = buildApp();
seedPeersFromEnv();

try {
  await app.listen({ port: PORT, host: BIND });

  startGossipLoop();
  startConsensusLoop();
  startSyncLoop();

  app.log.info({ bind: BIND, port: PORT }, "ghostbrain-cluster started");
} catch (err) {
  app.log.error(err, "ghostbrain-cluster failed to start");
  process.exit(1);
}

process.on("SIGTERM", async () => {
  app.log.info("SIGTERM — shutting down ghostbrain-cluster");
  stopSyncLoop();
  stopConsensusLoop();
  stopGossipLoop();
  await app.close();
  process.exit(0);
});
