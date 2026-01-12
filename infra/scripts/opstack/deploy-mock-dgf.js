#!/usr/bin/env node
/**
 * Deploys MockDisputeGameFactory to the current dev L1/L2 endpoints.
 * Useful for unblocking proposers/challengers when you just need a live factory address.
 */
const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");

const artifactPath = path.resolve(__dirname, "../../../contracts/artifacts/src/MockDisputeGameFactory.sol/MockDisputeGameFactory.json");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

const L1_RPC = process.env.L1_RPC || "http://localhost:28545";
const L2_RPC = process.env.L2_RPC || "http://localhost:29547";
const DEFAULT_PK = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // hardhat default

async function fundAndDeploy(rpcUrl, label) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const funder = new ethers.Wallet(DEFAULT_PK, provider);
  const deployer = ethers.Wallet.createRandom().connect(provider);
  // fund the fresh deployer to avoid address collisions on repeat runs
  console.log(`[${label}] Funding deployer ${deployer.address} from ${funder.address}...`);
  const fundTx = await funder.sendTransaction({ to: await deployer.getAddress(), value: ethers.parseEther("10") });
  console.log(`[${label}] Fund tx: ${fundTx.hash}`);
  await provider.waitForTransaction(fundTx.hash, 1, 30000);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  console.log(`[${label}] Deploying MockDisputeGameFactory from ${await deployer.getAddress()}...`);
  const contract = await factory.deploy();
  const receipt = await provider.waitForTransaction(contract.deploymentTransaction().hash, 1, 60000);
  const addr = await contract.getAddress();
  console.log(`[${label}] Deployed at ${addr} (tx: ${receipt.hash})`);
  return addr;
}

async function deploy(rpcUrl, label) {
  return fundAndDeploy(rpcUrl, label);
}

async function main() {
  const l1Addr = await deploy(L1_RPC, "L1");
  const l2Addr = await deploy(L2_RPC, "L2");
  console.log("\nSet these env vars to unblock proposers/challengers:");
  console.log(`L2_GAME_FACTORY_ADDRESS=${l1Addr}   # on L1`);
  console.log(`L3_GAME_FACTORY_ADDRESS=${l2Addr}   # on L2`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
