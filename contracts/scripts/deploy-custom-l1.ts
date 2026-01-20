import { ethers, artifacts, network } from "hardhat";
import fs from "fs";
import path from "path";
import crypto from "node:crypto";

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
  const outputDir = getEnv("OUTPUT_DIR", path.join(process.cwd(), "deployments", network.name));
  const outputFile = getEnv("OUTPUT_FILE", path.join(outputDir, "l1.json"));
  const version = process.env.CONTRACTS_VERSION ?? "0.0.1";

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

  const GhostNFT = await ethers.getContractFactory("GhostNFT");
  const nftName = process.env.L1_NFT_NAME ?? "GhostChain NFT";
  const nftSymbol = process.env.L1_NFT_SYMBOL ?? "GL1NFT";
  const nft = await GhostNFT.deploy(nftName, nftSymbol);
  await nft.waitForDeployment();
  console.log(`GhostNFT: ${nft.target as string}`);

  const contracts = [
    { name: "L1CrossDomainMessenger", address: messenger.target as string },
    { name: "L1SystemConfig", address: systemConfig.target as string },
    { name: "L1OptimismPortal", address: portal.target as string },
    { name: "L1OutputOracle", address: outputOracle.target as string },
    { name: "L1DisputeGameFactory", address: dgf.target as string },
    { name: "StandardBridge", address: l1Bridge.target as string },
    { name: "GhostNFT", address: nft.target as string }
  ];
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const enriched = await Promise.all(
    contracts.map(async (entry) => {
      const artifact = await artifacts.readArtifact(entry.name);
      const abiHash = crypto.createHash("sha256").update(JSON.stringify(artifact.abi)).digest("hex");
      return {
        name: entry.name,
        address: entry.address,
        chainId,
        layer: "l1",
        abi: artifact.abi,
        abiHash,
        version,
        deployedAt: new Date().toISOString()
      };
    })
  );
  const result = { network: network.name, layer: "l1", contracts: enriched };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2) + "\n");
  console.log(`Wrote deployments to ${outputFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
