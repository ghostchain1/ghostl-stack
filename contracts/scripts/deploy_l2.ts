/**
 * deploy_l2.ts — GhostL2 contract deployment
 *
 * Deploys the L2 (OP Stack) contract suite anchored to GhostChain L1:
 *   - StandardBridge (L2 side)
 *   - L2 Revenue Aggregator contracts
 *
 * Usage:
 *   npx hardhat run scripts/deploy_l2.ts --network ghostl2
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY — deployer account
 *   L1_ROLLUP_ADDRESS    — L1 rollup contract (0xad32D5C2Da9f4159C4cc98686C005852b3905355)
 *   L2_MESSENGER_ADDRESS — L2 cross-domain messenger
 */
import { ghost, network } from "hardhat";
import { promises as fs } from "node:fs";
import path from "node:path";

async function main() {
  const [deployer] = await ghost.getSigners();
  console.log(`Deploying L2 contracts on network: ${network.name}`);
  console.log(`Deployer: ${await deployer.getAddress()}`);

  const deployments: Record<string, string> = {};

  // ── StandardBridge (L2 side) ────────────────────────────────────────────
  const messengerAddr = process.env.L2_MESSENGER_ADDRESS;
  const remoteBridgeAddr = process.env.L1_BRIDGE_ADDRESS;
  if (!messengerAddr || !remoteBridgeAddr) {
    throw new Error("L2_MESSENGER_ADDRESS and L1_BRIDGE_ADDRESS must be set");
  }

  const Bridge = await ghost.getContractFactory("StandardBridge");
  const bridge = await Bridge.deploy(messengerAddr, remoteBridgeAddr);
  await bridge.waitForDeployment();
  deployments.StandardBridge = await bridge.getAddress();
  console.log(`StandardBridge (L2) deployed: ${deployments.StandardBridge}`);

  // ── Write deployment record ─────────────────────────────────────────────
  const outPath = path.resolve(__dirname, "../deployments/l2.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ network: network.name, ...deployments }, null, 2));
  console.log(`Deployment record written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
