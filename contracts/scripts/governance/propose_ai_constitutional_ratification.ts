/* eslint-disable no-console */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_DOC_PATH = path.join(repoRoot, "docs", "ghostchain", "charter.md");
const DEFAULT_REPORT_PATH = path.join(
  repoRoot,
  "contracts",
  "reports",
  "ai_constitutional_proposal_id.json"
);
const DEFAULT_DEPLOYMENT_PATH = path.join(
  repoRoot,
  "contracts",
  "reports",
  "ai_constitutional_deployment.json"
);

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

const envFilePath =
  process.env.STACK_ENV_FILE || path.join(repoRoot, "services", "stack.env");
const fileEnv = loadEnvFile(envFilePath);
const readEnv = (key: string) => process.env[key] ?? fileEnv[key];

const governorAddress =
  readEnv("AI_CONSTITUTION_GOVERNOR") ||
  readEnv("GOVERNOR_ADDRESS_L1") ||
  readEnv("FUT_GOVERNOR") ||
  "";

const deploymentPath = process.env.AI_CONSTITUTION_DEPLOYMENT_OUTPUT || DEFAULT_DEPLOYMENT_PATH;
const reportPath = process.env.AI_CONSTITUTION_PROPOSAL_REPORT || DEFAULT_REPORT_PATH;

const proposalAddressEnv = readEnv("AI_CONSTITUTION_PROPOSAL_ADDRESS") || "";

const docPath = process.env.CONSTITUTION_DOC_PATH || DEFAULT_DOC_PATH;
const constitutionHashEnv = process.env.CONSTITUTION_HASH;

const normalizeAddress = (label: string, value: string) => {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`missing_or_invalid_${label}`);
  }
  return ethers.getAddress(value);
};

const readConstitutionHash = () => {
  if (constitutionHashEnv) {
    if (!ethers.isHexString(constitutionHashEnv, 32)) {
      throw new Error(`invalid_CONSTITUTION_HASH:${constitutionHashEnv}`);
    }
    return constitutionHashEnv;
  }
  const text = fs.readFileSync(docPath, "utf8");
  const sha256 = crypto.createHash("sha256").update(text).digest("hex");
  return `0x${sha256}`;
};

const resolveProposalAddress = () => {
  if (proposalAddressEnv) return normalizeAddress("AI_CONSTITUTION_PROPOSAL_ADDRESS", proposalAddressEnv);
  if (fs.existsSync(deploymentPath)) {
    const payload = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    if (payload?.address && ethers.isAddress(payload.address)) {
      return ethers.getAddress(payload.address);
    }
  }
  throw new Error("missing_AI_CONSTITUTION_PROPOSAL_ADDRESS");
};

async function main() {
  const governor = normalizeAddress("GOVERNOR_ADDRESS", governorAddress);
  const proposalAddress = resolveProposalAddress();
  const constitutionHash = readConstitutionHash();

  const [deployer] = await ethers.getSigners();
  const governorContract = new ethers.Contract(
    governor,
    [
      "function proposalsLength() view returns (uint256)",
      "function propose(address target,uint256 value,bytes data) returns (uint256)"
    ],
    deployer
  );

  const abi = ["function ratify(uint256 proposalId, bytes32 constitutionHash) external"];
  const iface = new ethers.Interface(abi);
  const nextId = await governorContract.proposalsLength();
  const data = iface.encodeFunctionData("ratify", [nextId, constitutionHash]);

  const tx = await governorContract.propose(proposalAddress, 0, data);
  const receipt = await tx.wait();

  const payload = {
    proposalId: nextId.toString(),
    governor,
    proposalAddress,
    constitutionHash,
    ratifyCalldata: data,
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber ?? null,
    createdAt: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), "utf8");

  console.log("[constitution] proposal id:", payload.proposalId);
  console.log("[constitution] report:", reportPath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
