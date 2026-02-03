/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_REPORT_PATH = path.join(
  repoRoot,
  "contracts",
  "reports",
  "ai_constitutional_proposal_id.json"
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

const proposalIdRaw =
  readEnv("CONSTITUTION_PROPOSAL_ID") ||
  (fs.existsSync(DEFAULT_REPORT_PATH)
    ? JSON.parse(fs.readFileSync(DEFAULT_REPORT_PATH, "utf8")).proposalId
    : "");
if (!proposalIdRaw) {
  throw new Error("missing_CONSTITUTION_PROPOSAL_ID");
}
const proposalId = Number(proposalIdRaw);
if (!Number.isFinite(proposalId) || proposalId < 0) {
  throw new Error(`invalid_CONSTITUTION_PROPOSAL_ID:${proposalIdRaw}`);
}

const governorAddress =
  readEnv("AI_CONSTITUTION_GOVERNOR") ||
  readEnv("GOVERNOR_ADDRESS_L1") ||
  readEnv("FUT_GOVERNOR") ||
  "";
const proposalAddress = readEnv("AI_CONSTITUTION_PROPOSAL_ADDRESS") || "";

const normalizeAddress = (label: string, value: string) => {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`missing_or_invalid_${label}`);
  }
  return ethers.getAddress(value);
};

async function main() {
  const [signer] = await ethers.getSigners();
  const governor = normalizeAddress("GOVERNOR_ADDRESS", governorAddress);
  const proposalContract = normalizeAddress(
    "AI_CONSTITUTION_PROPOSAL_ADDRESS",
    proposalAddress
  );

  const gov = new ethers.Contract(
    governor,
    [
      "function proposals(uint256) view returns (address target,uint256 value,bytes data,uint256 forVotes,uint256 againstVotes,uint256 start,uint256 end,bool queued,bool executed)",
      "function votingToken() view returns (address)",
      "function executor() view returns (address)"
    ],
    signer
  );

  const proposal = await gov.proposals(proposalId);
  const votingToken = await gov.votingToken();
  const executor = await gov.executor();

  const token = new ethers.Contract(
    votingToken,
    ["function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)"],
    signer
  );
  const totalSupply = await token.totalSupply();
  const signerBalance = await token.balanceOf(signer.address);

  const constitution = new ethers.Contract(
    proposalContract,
    [
      "function ratified() view returns (bool)",
      "function ratifiedAt() view returns (uint64)",
      "function activatesAt() view returns (uint64)"
    ],
    signer
  );

  const ratified = await constitution.ratified();

  const payload = {
    proposalId: proposalId.toString(),
    governor,
    executor,
    proposalTarget: proposal.target,
    proposalValue: proposal.value.toString(),
    proposalData: proposal.data,
    forVotes: proposal.forVotes.toString(),
    againstVotes: proposal.againstVotes.toString(),
    start: proposal.start.toString(),
    end: proposal.end.toString(),
    queued: proposal.queued,
    executed: proposal.executed,
    votingToken,
    totalSupply: totalSupply.toString(),
    signer: signer.address,
    signerBalance: signerBalance.toString(),
    ratified,
    ratifiedAt: (await constitution.ratifiedAt()).toString(),
    activatesAt: (await constitution.activatesAt()).toString()
  };

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
