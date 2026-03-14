/**
 * deploy_l3.ts — GhostL3 application-layer contract deployment
 *
 * Deploys GhostL3 (OP Stack, chain_id=903) app contracts anchored to GhostL2:
 *   - StandardBridge (L3 side, settles to L2)
 *   - GRC20 / GRC721 / GRC1155 token factories
 *
 * Usage:
 *   npx hardhat run scripts/deploy_l3.ts --network ghostl3
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY — deployer account
 *   L3_MESSENGER_ADDRESS — L3 cross-domain messenger
 *   L2_BRIDGE_ADDRESS    — L2 bridge (remote bridge for L3)
 */
import { ghost, network } from "hardhat";
import { promises as fs } from "node:fs";
import path from "node:path";

async function main() {
  const [deployer] = await ghost.getSigners();
  console.log(`Deploying L3 contracts on network: ${network.name}`);
  console.log(`Deployer: ${await deployer.getAddress()}`);

  const deployments: Record<string, string> = {};

  // ── StandardBridge (L3 side) ────────────────────────────────────────────
  const messengerAddr = process.env.L3_MESSENGER_ADDRESS;
  const remoteBridgeAddr = process.env.L2_BRIDGE_ADDRESS;
  if (!messengerAddr || !remoteBridgeAddr) {
    throw new Error("L3_MESSENGER_ADDRESS and L2_BRIDGE_ADDRESS must be set");
  }

  const Bridge = await ghost.getContractFactory("StandardBridge");
  const bridge = await Bridge.deploy(messengerAddr, remoteBridgeAddr);
  await bridge.waitForDeployment();
  deployments.StandardBridge = await bridge.getAddress();
  console.log(`StandardBridge (L3) deployed: ${deployments.StandardBridge}`);

  // ── Write deployment record ─────────────────────────────────────────────
  const outPath = path.resolve(__dirname, "../deployments/l3.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ network: network.name, ...deployments }, null, 2));
  console.log(`Deployment record written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
