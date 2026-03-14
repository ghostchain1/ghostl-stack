/**
 * deployment-writer.ts — Hardhat deploy script generator.
 *
 * Produces TypeScript Hardhat task scripts that use `hre.ghost.getContractFactory()`
 * (the Ghost SDK namespace) and NOT `hre.ethers`.
 */

export interface DeployScriptOptions {
  /** Contract name as it appears in the Forge artifact, e.g. "GhostGovToken" */
  contractName: string;
  /**
   * TypeScript constructor argument expressions in order, e.g.
   * ['"My Token"', '"MTK"', 'hre.ghost.parseGhost("1000000")']
   */
  constructorArgs?: string[];
  /**
   * Chain ID to deploy on (14000101 = L1, 901 = L2, 903 = L3).
   * Used only for the script comment — not enforced at runtime.
   */
  chainId?: number;
  /** Whether to log the deployment to a JSON file in deployments/ (default true) */
  persistDeployment?: boolean;
}

/**
 * Generates a Hardhat task script source string for deploying `contractName`.
 *
 * @param opts       Script options
 * @param outputPath Workspace-relative destination, e.g. "contracts/scripts/deploy_GhostGovToken.ts"
 */
export function generateDeployScript(
  opts: DeployScriptOptions,
  outputPath: string,
): string {
  const name            = opts.contractName;
  const constructorArgs = opts.constructorArgs ?? [];
  const chainId         = opts.chainId ?? 14000101; // GhostChain L1 default
  const persist         = opts.persistDeployment ?? true;

  const argsBlock = constructorArgs.length > 0
    ? `\n    ${constructorArgs.join(",\n    ")},\n  `
    : "";

  const persistBlock = persist
    ? `
  // Persist deployment record
  const { writeFileSync, mkdirSync } = await import("fs");
  const { join } = await import("path");
  const dir = join(__dirname, "..", "deployments");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, \`${name}-\${hre.network.name}.json\`),
    JSON.stringify({ address, deployer: await deployer.getAddress(), block: await hre.ethers.provider.getBlockNumber() }, null, 2),
  );`
    : "";

  return `\
// ${outputPath}
// GhostChain deploy script — target chain ID: ${chainId}
// Run: cd contracts && npx hardhat deploy:${name} --network ghostchain

import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

task("deploy:${name}", "Deploy the ${name} contract to GhostChain").setAction(
  async (_taskArgs: Record<string, unknown>, hre: HardhatRuntimeEnvironment) => {
    const [deployer] = await hre.ghost.getSigners();
    console.log("[deploy:${name}] Deployer:", await deployer.getAddress());

    const Factory  = await hre.ghost.getContractFactory("${name}", deployer);
    const contract = await Factory.deploy(${argsBlock});
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log("[deploy:${name}] Deployed to:", address);
${persistBlock}
    return address;
  },
);
`;
}
