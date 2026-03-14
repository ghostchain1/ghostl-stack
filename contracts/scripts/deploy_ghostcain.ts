/**
 * Deploy GRC20Ghost (GST token) from ghostcain-contracts integration.
 *
 * Usage (Hardhat):
 *   hardhat run --network ghostl1  scripts/deploy_ghostcain.ts
 *   hardhat run --network ghostl2  scripts/deploy_ghostcain.ts
 *   hardhat run --network ghostl3  scripts/deploy_ghostcain.ts
 *
 * The initial supply defaults to 1 000 000 000 GST (1e9 × 1e18 wei).
 * Override via env: GHOSTCAIN_INITIAL_SUPPLY=<wei_amount>
 */
import { ethers } from "hardhat";

const INITIAL_SUPPLY_GST = process.env.GHOSTCAIN_INITIAL_SUPPLY
  ? BigInt(process.env.GHOSTCAIN_INITIAL_SUPPLY)
  : ethers.parseUnits("1000000000", 18); // 1 billion GST

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying GRC20Ghost (GST) with account:", deployer.address);
  console.log("Initial supply (wei):", INITIAL_SUPPLY_GST.toString());

  const GRC20Ghost = await ethers.getContractFactory("GRC20Ghost");
  const token = await GRC20Ghost.deploy(INITIAL_SUPPLY_GST);
  await token.waitForDeployment();

  const address = await token.getAddress();
  console.log("GRC20Ghost (GST) deployed to:", address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
