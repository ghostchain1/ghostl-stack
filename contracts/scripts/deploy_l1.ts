/**
 * deploy_l1.ts — GhostChain L1 core contract deployment
 *
 * Deploys the canonical L1 contract suite:
 *   - GhostToken (GST)
 *   - GhostChainGovernor + ProposalExecutor
 *   - SovereignTreasuryEngine
 *   - StandardBridge (L1 → L2)
 *
 * Usage:
 *   npx hardhat run scripts/deploy_l1.ts --network ghostchain
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY — deployer account
 *   L1_CHAIN_ID          — must be 14000101
 *   L2_CHAIN_ID          — must be 901
 */
import { ghost, network, artifacts } from "hardhat";
import { promises as fs } from "node:fs";
import path from "node:path";

async function main() {
  const [deployer] = await ghost.getSigners();
  console.log(`Deploying L1 contracts on network: ${network.name}`);
  console.log(`Deployer: ${await deployer.getAddress()}`);

  const deployments: Record<string, string> = {};

  // ── GhostToken (GST) ────────────────────────────────────────────────────
  const GhostToken = await ghost.getContractFactory("GhostToken");
  const gst = await GhostToken.deploy(1 /* L1 */);
  await gst.waitForDeployment();
  deployments.GhostToken = await gst.getAddress();
  console.log(`GhostToken (GST) deployed: ${deployments.GhostToken}`);

  // ── ProposalExecutor ────────────────────────────────────────────────────
  const ProposalExecutor = await ghost.getContractFactory("ProposalExecutor");
  const executor = await ProposalExecutor.deploy(await deployer.getAddress());
  await executor.waitForDeployment();
  deployments.ProposalExecutor = await executor.getAddress();
  console.log(`ProposalExecutor deployed: ${deployments.ProposalExecutor}`);

  // ── Write deployment record ─────────────────────────────────────────────
  const outPath = path.resolve(__dirname, "../deployments/l1.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ network: network.name, ...deployments }, null, 2));
  console.log(`Deployment record written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
