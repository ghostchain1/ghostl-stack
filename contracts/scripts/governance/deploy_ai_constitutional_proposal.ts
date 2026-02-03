/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";

const DEFAULT_SUPERMAJORITY_BPS = 6667;
const DEFAULT_QUORUM_BPS = 5000;
const DEFAULT_ACTIVATION_DELAY_SECONDS = 2 * 24 * 60 * 60;
const DEFAULT_MAX_AUTHORITY_BPS = 1500;
const DEFAULT_EMERGENCY_SCOPE = "ghost.ai.emergency.policy";
const DEFAULT_EMERGENCY_EXPIRY_SECONDS = 24 * 60 * 60;

const loadEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const out: Record<string, string> = {};
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
};

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const envFilePath =
  process.env.STACK_ENV_FILE || path.join(repoRoot, "services", "stack.env");
const fileEnv = loadEnvFile(envFilePath);
const readEnv = (key: string) => process.env[key] ?? fileEnv[key];

const governorAddress =
  readEnv("AI_CONSTITUTION_GOVERNOR") ||
  readEnv("GOVERNOR_ADDRESS_L1") ||
  readEnv("FUT_GOVERNOR") ||
  "";
const executorAddress =
  readEnv("AI_CONSTITUTION_EXECUTOR") ||
  readEnv("EXECUTOR_ADDRESS_L1") ||
  readEnv("FUT_EXECUTOR") ||
  "";

const supermajorityBps = Number(
  readEnv("AI_CONSTITUTION_SUPERMAJORITY_BPS") ?? DEFAULT_SUPERMAJORITY_BPS
);
const quorumBps = Number(readEnv("AI_CONSTITUTION_QUORUM_BPS") ?? DEFAULT_QUORUM_BPS);
const activationDelaySeconds = Number(
  readEnv("AI_CONSTITUTION_ACTIVATION_DELAY_SECONDS") ?? DEFAULT_ACTIVATION_DELAY_SECONDS
);
const maxAuthorityBps = Number(
  readEnv("AI_CONSTITUTION_MAX_AUTHORITY_BPS") ?? DEFAULT_MAX_AUTHORITY_BPS
);
const emergencyScopeRaw =
  readEnv("AI_CONSTITUTION_EMERGENCY_SCOPE") ?? DEFAULT_EMERGENCY_SCOPE;
const emergencyExpirySeconds = Number(
  readEnv("AI_CONSTITUTION_EMERGENCY_EXPIRY_SECONDS") ?? DEFAULT_EMERGENCY_EXPIRY_SECONDS
);

const outputPath =
  process.env.AI_CONSTITUTION_DEPLOYMENT_OUTPUT ||
  path.join(repoRoot, "contracts", "reports", "ai_constitutional_deployment.json");

const normalizeAddress = (label: string, value: string) => {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`missing_or_invalid_${label}`);
  }
  return ethers.getAddress(value);
};

const normalizeBytes32 = (label: string, value: string) => {
  if (ethers.isHexString(value, 32)) return value;
  try {
    return ethers.id(value);
  } catch {
    throw new Error(`invalid_${label}:${value}`);
  }
};

async function main() {
  const governor = normalizeAddress("GOVERNOR_ADDRESS", governorAddress);
  const executor = normalizeAddress("EXECUTOR_ADDRESS", executorAddress);
  const emergencyScope = normalizeBytes32("EMERGENCY_SCOPE", emergencyScopeRaw);

  const [deployer] = await ethers.getSigners();
  const provider = deployer.provider;
  if (!provider) {
    throw new Error("missing_provider");
  }

  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  const Factory = await ethers.getContractFactory("AIConstitutionalProposal");
  const contract = await Factory.deploy(
    governor,
    executor,
    supermajorityBps,
    quorumBps,
    activationDelaySeconds,
    maxAuthorityBps,
    emergencyScope,
    emergencyExpirySeconds
  );

  const tx = contract.deploymentTransaction();
  if (tx?.hash) {
    await tx.wait();
  }

  const address = await contract.getAddress();
  const payload = {
    address,
    chainId,
    governor,
    executor,
    supermajorityBps,
    quorumBps,
    activationDelaySeconds,
    maxAuthorityBps,
    emergencyScope,
    emergencyExpirySeconds,
    deployedBy: deployer.address,
    txHash: tx?.hash ?? null,
    deployedAt: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");

  console.log("[constitution] deployed:", address);
  console.log("[constitution] report:", outputPath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
