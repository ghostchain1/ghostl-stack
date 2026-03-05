import { ghost, network, artifacts } from "hardhat";
import path from "node:path";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
};

const layerArg = (getArg("--layer") || "l1").toLowerCase();
if (!["l1", "l2", "l3", "all"].includes(layerArg)) {
  console.error("Invalid --layer. Use l1|l2|l3|all.");
  process.exit(1);
}

const GAS_LIMIT = BigInt(process.env.DEPLOY_GAS_LIMIT ?? "5000000");
const MAX_FEE_PER_GAS = process.env.DEPLOY_MAX_FEE_PER_GAS ? BigInt(process.env.DEPLOY_MAX_FEE_PER_GAS) : undefined;
const MAX_PRIORITY_FEE_PER_GAS = process.env.DEPLOY_MAX_PRIORITY_FEE_PER_GAS
  ? BigInt(process.env.DEPLOY_MAX_PRIORITY_FEE_PER_GAS)
  : undefined;
const txOpts =
  MAX_FEE_PER_GAS !== undefined && MAX_PRIORITY_FEE_PER_GAS !== undefined
    ? { gasLimit: GAS_LIMIT, maxFeePerGas: MAX_FEE_PER_GAS, maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS }
    : { gasLimit: GAS_LIMIT };

const outputDir = process.env.OUTPUT_DIR ?? path.resolve(__dirname, "..", "deployments", network.name);
const version = process.env.CONTRACTS_VERSION ?? "0.0.1";

type DeploymentEntry = {
  name: string;
  address: string;
  chainId: number;
  layer: string;
  abi: unknown;
  abiHash: string;
  version: string;
  deployedAt: string;
};

const recordDeployment = async (name: string, address: string, chainId: number, layer: string) => {
  const artifact = await artifacts.readArtifact(name);
  const abiHash = crypto.createHash("sha256").update(JSON.stringify(artifact.abi)).digest("hex");
  return {
    name,
    address,
    chainId,
    layer,
    abi: artifact.abi,
    abiHash,
    version,
    deployedAt: new Date().toISOString()
  };
};

const deployGuardian = async (contractName: string, layer: string) => {
  const factory = await ghost.getContractFactory(contractName);
  const contract = await factory.deploy(txOpts);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const chainId = Number(network.config.chainId ?? (await ghost.provider.getNetwork()).chainId);
  return recordDeployment(contractName, address, chainId, layer);
};

const run = async (layers: string[]) => {
  await fs.mkdir(outputDir, { recursive: true });
  for (const layer of layers) {
    let contractName = "AIGuardianL1";
    if (layer === "l2") contractName = "AIGuardianL2";
    if (layer === "l3") contractName = "AIGuardianL3";
    const entry = await deployGuardian(contractName, layer);
    const filePath = path.join(outputDir, `ai-${layer}.json`);
    const payload = { network: network.name, layer, contracts: [entry] };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
    console.log(`${contractName} deployed at ${entry.address} (layer ${layer})`);
  }
};

const layers = layerArg === "all" ? ["l1", "l2", "l3"] : [layerArg];
run(layers).catch((err) => {
  console.error(err);
  process.exit(1);
});
