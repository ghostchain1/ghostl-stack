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

const L1_RPC = process.env.L1_RPC || "http://localhost:18545";
const L2_RPC = process.env.L2_RPC || "http://localhost:29547";
const L1_CHAIN_ID = process.env.L1_CHAIN_ID ? Number(process.env.L1_CHAIN_ID) : 14000101;
const L2_CHAIN_ID = process.env.L2_CHAIN_ID ? Number(process.env.L2_CHAIN_ID) : 901;
const DEFAULT_PK = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!DEFAULT_PK) {
  console.error("Missing DEPLOYER_PRIVATE_KEY (or PRIVATE_KEY) for deployment");
  process.exit(1);
}

async function fundAndDeploy(rpcUrl, label, chainId) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, { chainId, name: `${label.toLowerCase()}-chain` });
  const deployer = new ethers.Wallet(DEFAULT_PK, provider);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  console.log(`[${label}] Deploying MockDisputeGameFactory from ${await deployer.getAddress()}...`);
  const feeOpts = { maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"), maxFeePerGas: ethers.parseUnits("10", "gwei") };
  const contract = await factory.deploy({ gasLimit: 6_000_000n, ...feeOpts });
  const txHash = contract.deploymentTransaction().hash;
  let receipt = null;
  for (let i = 0; i < 120; i++) { // ~120s
    try {
      receipt = await provider.getTransactionReceipt(txHash);
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("transaction indexing is in progress")) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
    if (receipt) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!receipt) {
    throw new Error(`[${label}] Timeout waiting for deployment tx ${txHash}`);
  }
  const addr = await contract.getAddress();
  console.log(`[${label}] Deployed at ${addr} (tx: ${receipt.hash})`);
  return addr;
}

async function deploy(rpcUrl, label) {
  const chainId = label === "L1" ? L1_CHAIN_ID : L2_CHAIN_ID;
  return fundAndDeploy(rpcUrl, label, chainId);
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
