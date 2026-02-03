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
const DEFAULT_VOTE_REPORT_PATH = path.join(
  repoRoot,
  "contracts",
  "reports",
  "ai_constitutional_vote.json"
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

const readProposalId = () => {
  const raw = readEnv("CONSTITUTION_PROPOSAL_ID");
  if (raw) return raw;
  if (fs.existsSync(DEFAULT_REPORT_PATH)) {
    const payload = JSON.parse(fs.readFileSync(DEFAULT_REPORT_PATH, "utf8"));
    if (payload?.proposalId !== undefined) {
      return String(payload.proposalId);
    }
  }
  return "";
};

const proposalIdRaw = readProposalId();
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

const normalizeAddress = (label: string, value: string) => {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`missing_or_invalid_${label}`);
  }
  return ethers.getAddress(value);
};

const SUPPORT =
  (process.env.CONSTITUTION_VOTE_SUPPORT ?? "true").toLowerCase() !== "false";

async function main() {
  const governor = normalizeAddress("GOVERNOR_ADDRESS", governorAddress);
  const [voter] = await ethers.getSigners();
  const governorContract = new ethers.Contract(
    governor,
    [
      "function vote(uint256 id, bool support) external",
      "function hasVoted(uint256 id, address voter) view returns (bool)",
      "function proposals(uint256) view returns (address target,uint256 value,bytes data,uint256 forVotes,uint256 againstVotes,uint256 start,uint256 end,bool queued,bool executed)"
    ],
    voter
  );

  const alreadyVoted = await governorContract.hasVoted(proposalId, voter.address);
  if (alreadyVoted) {
    console.log(`[constitution] voter ${voter.address} already voted on proposal ${proposalId}`);
  } else {
    const tx = await governorContract.vote(proposalId, SUPPORT);
    const receipt = await tx.wait();
    console.log(`[constitution] vote submitted: ${tx.hash}`);
    console.log(`[constitution] block: ${receipt?.blockNumber ?? "n/a"}`);
  }

  const proposal = await governorContract.proposals(proposalId);
  const payload = {
    proposalId: proposalId.toString(),
    governor,
    voter: voter.address,
    support: SUPPORT,
    forVotes: proposal.forVotes.toString(),
    againstVotes: proposal.againstVotes.toString(),
    queued: proposal.queued,
    executed: proposal.executed,
    recordedAt: new Date().toISOString()
  };

  const outputPath = process.env.AI_CONSTITUTION_VOTE_REPORT || DEFAULT_VOTE_REPORT_PATH;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[constitution] vote report: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
