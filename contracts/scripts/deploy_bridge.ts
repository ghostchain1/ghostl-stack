/**
 * deploy_bridge.ts — StandardBridge deployment script
 *
 * Deploys a StandardBridge on the target layer, wiring it to a remote bridge
 * via the cross-domain messenger.
 *
 * Usage:
 *   npx hardhat run scripts/deploy_bridge.ts --network ghostl2
 *   npx hardhat run scripts/deploy_bridge.ts --network ghostl3
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY  — deployer account
 *   MESSENGER_ADDRESS     — local XDomain messenger address
 *   REMOTE_BRIDGE_ADDRESS — bridge address on the remote chain
 */
import { ghost, network } from "hardhat";
import { promises as fs } from "node:fs";
import path from "node:path";

async function main() {
  const [deployer] = await ghost.getSigners();
  const messengerAddr = process.env.MESSENGER_ADDRESS;
  const remoteBridgeAddr = process.env.REMOTE_BRIDGE_ADDRESS;

  if (!messengerAddr || !remoteBridgeAddr) {
    throw new Error("MESSENGER_ADDRESS and REMOTE_BRIDGE_ADDRESS must be set");
  }

  console.log(`Deploying StandardBridge on network: ${network.name}`);
  console.log(`Deployer:      ${await deployer.getAddress()}`);
  console.log(`Messenger:     ${messengerAddr}`);
  console.log(`Remote bridge: ${remoteBridgeAddr}`);

  const Bridge = await ghost.getContractFactory("StandardBridge");
  const bridge = await Bridge.deploy(messengerAddr, remoteBridgeAddr);
  await bridge.waitForDeployment();

  const address = await bridge.getAddress();
  console.log(`StandardBridge deployed: ${address}`);

  // ── Write deployment record ─────────────────────────────────────────────
  const outPath = path.resolve(__dirname, "../deployments/bridge.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(
    outPath,
    JSON.stringify(
      { network: network.name, StandardBridge: address, messenger: messengerAddr, remoteBridge: remoteBridgeAddr },
      null,
      2,
    ),
  );
  console.log(`Deployment record written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
