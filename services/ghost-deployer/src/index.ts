/**
 * ghost-deployer — Autonomous Contract Deployment Pipeline
 *
 * Deployment flow:
 *   1. Compile   — `forge build --skip test` via subprocess
 *   2. Audit     — send ABI to GhostBrain AI for security scan
 *   3. Deploy    — forge script or raw RPC CREATE on target layer
 *   4. Bridge    — register on L2 bridge (L3 → L2, optional)
 *   5. Settle    — request L1 settlement via GhostBrain oracle (optional)
 *
 * Port : 7961  (DEPLOYER_PORT env to override)
 * Bind : 127.0.0.1 (DEPLOYER_BIND env — set 0.0.0.0 in Docker)
 *
 * Chains:
 *   L1  GhostChain  chainId=14000101  rpc=GHOST_L1_RPC  (default: :18545)
 *   L2  GhostL2     chainId=901       rpc=GHOST_L2_RPC  (default: :29547)
 *   L3  GhostL3     chainId=903       rpc=GHOST_L3_RPC  (default: :39545)
 */

import { buildApp }           from "./app.js";
import { DEPLOYER_PORT, DEPLOYER_BIND } from "./config.js";

const app = buildApp();

try {
  await app.listen({ port: DEPLOYER_PORT, host: DEPLOYER_BIND });
  app.log.info({ bind: DEPLOYER_BIND, port: DEPLOYER_PORT }, "ghost-deployer started");
} catch (err) {
  app.log.error(err, "ghost-deployer failed to start");
  process.exit(1);
}

process.on("SIGTERM", async () => {
  app.log.info("SIGTERM received — shutting down ghost-deployer");
  await app.close();
  process.exit(0);
});
