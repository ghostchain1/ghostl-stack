/**
 * deploy_token.ts — GRC token deployment script
 *
 * Deploys a GRC-20 / GRC-721 / GRC-1155 token on the target network.
 *
 * Usage:
 *   TOKEN_TYPE=GRC20  npx hardhat run scripts/deploy_token.ts --network ghostl2
 *   TOKEN_TYPE=GRC721 npx hardhat run scripts/deploy_token.ts --network ghostl3
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY — deployer account
 *   TOKEN_TYPE           — GRC20 | GRC721 | GRC1155
 *   TOKEN_NAME           — token name (GRC20/721 only)
 *   TOKEN_SYMBOL         — token symbol (GRC20/721 only)
 */
import { ghost, network } from "hardhat";
import { promises as fs } from "node:fs";
import path from "node:path";

const TOKEN_FACTORIES: Record<string, string> = {
  GRC20:   "GRC20",
  GRC721:  "GRC721",
  GRC1155: "GRC1155",
};

async function main() {
  const [deployer] = await ghost.getSigners();
  const tokenType = process.env.TOKEN_TYPE ?? "GRC20";
  const contractName = TOKEN_FACTORIES[tokenType];
  if (!contractName) {
    throw new Error(`Unknown TOKEN_TYPE: ${tokenType}. Must be GRC20, GRC721, or GRC1155.`);
  }

  console.log(`Deploying ${tokenType} on network: ${network.name}`);
  console.log(`Deployer: ${await deployer.getAddress()}`);

  const Factory = await ghost.getContractFactory(contractName);
  const token = await Factory.deploy();
  await token.waitForDeployment();

  const address = await token.getAddress();
  console.log(`${tokenType} deployed: ${address}`);

  // ── Write deployment record ─────────────────────────────────────────────
  const outPath = path.resolve(__dirname, `../deployments/token_${tokenType.toLowerCase()}.json`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(
    outPath,
    JSON.stringify({ network: network.name, tokenType, address }, null, 2),
  );
  console.log(`Deployment record written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
