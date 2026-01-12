import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

function getEnv(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

async function main() {
  const childMessenger = getEnv("CHILD_MESSENGER", "0x0000000000000000000000000000000000000000");
  const l2Bridge = getEnv("L2_BRIDGE", "0x0000000000000000000000000000000000000000");
  const batcher = getEnv("BATCHER", ethers.ZeroAddress);
  const unsafeBlockSigner = getEnv("UNSAFE_BLOCK_SIGNER", ethers.ZeroAddress);
  const gasLimit = BigInt(getEnv("GAS_LIMIT", "30000000"));
  const overhead = BigInt(getEnv("OVERHEAD", "2100"));
  const scalar = BigInt(getEnv("SCALAR", "1000000"));
  const proposer = getEnv("PROPOSER", ethers.ZeroAddress);
  const outputFile = getEnv("OUTPUT_FILE", path.join(process.cwd(), "../infra/opstack/config/l1-deployments.custom.json"));

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const L1Messenger = await ethers.getContractFactory("L1CrossDomainMessenger");
  const messenger = await L1Messenger.deploy(childMessenger);
  await messenger.waitForDeployment();
  console.log(`L1CrossDomainMessenger: ${messenger.target as string}`);

  const SystemConfig = await ethers.getContractFactory("L1SystemConfig");
  const systemConfig = await SystemConfig.deploy(batcher, unsafeBlockSigner, gasLimit, overhead, scalar);
  await systemConfig.waitForDeployment();
  console.log(`L1SystemConfig: ${systemConfig.target as string}`);

  const Portal = await ethers.getContractFactory("L1OptimismPortal");
  const portal = await Portal.deploy(systemConfig.target as string);
  await portal.waitForDeployment();
  console.log(`L1OptimismPortal: ${portal.target as string}`);

  const OutputOracle = await ethers.getContractFactory("L1OutputOracle");
  const outputOracle = await OutputOracle.deploy(proposer);
  await outputOracle.waitForDeployment();
  console.log(`L1OutputOracle: ${outputOracle.target as string}`);

  const DGF = await ethers.getContractFactory("L1DisputeGameFactory");
  const dgf = await DGF.deploy();
  await dgf.waitForDeployment();
  console.log(`L1DisputeGameFactory: ${dgf.target as string}`);

  const Bridge = await ethers.getContractFactory("StandardBridge");
  const l1Bridge = await Bridge.deploy(messenger.target as string, l2Bridge);
  await l1Bridge.waitForDeployment();
  console.log(`L1 StandardBridge: ${l1Bridge.target as string}`);

  const result = {
    L1CrossDomainMessenger: messenger.target as string,
    SystemConfig: systemConfig.target as string,
    OptimismPortal: portal.target as string,
    L1OutputOracle: outputOracle.target as string,
    DisputeGameFactory: dgf.target as string,
    L1StandardBridge: l1Bridge.target as string
  };

  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2) + "\n");
  console.log(`Wrote deployments to ${outputFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
