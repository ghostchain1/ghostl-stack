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
const DEFAULT_EXEC_REPORT_PATH = path.join(
  repoRoot,
  "contracts",
  "reports",
  "ai_constitutional_execution.json"
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

const AUTO_EXECUTE =
  (process.env.CONSTITUTION_AUTO_EXECUTE ?? "true").toLowerCase() !== "false";

async function main() {
  const governor = normalizeAddress("GOVERNOR_ADDRESS", governorAddress);
  const [signer] = await ethers.getSigners();
  const provider = signer.provider;
  if (!provider) {
    throw new Error("missing_provider");
  }

  const governorContract = new ethers.Contract(
    governor,
    [
      "function queue(uint256 id) external",
      "function execute(uint256 id) external",
      "function proposals(uint256) view returns (address target,uint256 value,bytes data,uint256 forVotes,uint256 againstVotes,uint256 start,uint256 end,bool queued,bool executed)",
      "function executor() view returns (address)",
      "function owner() view returns (address)"
    ],
    signer
  );

  const owner = await governorContract.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`signer_not_owner:${signer.address}`);
  }

  let proposal = await governorContract.proposals(proposalId);
  let queuedTxHash: string | null = null;
  if (!proposal.queued) {
    const tx = await governorContract.queue(proposalId);
    const receipt = await tx.wait();
    queuedTxHash = tx.hash;
    console.log(`[constitution] queued proposal ${proposalId}: ${tx.hash}`);
    console.log(`[constitution] block: ${receipt?.blockNumber ?? "n/a"}`);
    proposal = await governorContract.proposals(proposalId);
  } else {
    console.log(`[constitution] proposal ${proposalId} already queued`);
  }

  const executorAddress = await governorContract.executor();
  const executor = new ethers.Contract(
    executorAddress,
    [
      "function queue(uint256) view returns (address target,uint256 value,bytes data,uint256 eta,bool executed)",
      "function delay() view returns (uint256)"
    ],
    signer
  );
  const queued = await executor.queue(proposalId);
  const now = (await provider.getBlock("latest"))?.timestamp ?? 0;
  const eta = Number(queued.eta);

  let executedTxHash: string | null = null;
  let executeError: string | null = null;

  if (AUTO_EXECUTE) {
    if (now >= eta) {
      if (!proposal.executed) {
        const execTx = await governorContract.execute(proposalId);
        const receipt = await execTx.wait();
        executedTxHash = execTx.hash;
        console.log(`[constitution] executed proposal ${proposalId}: ${execTx.hash}`);
        console.log(`[constitution] block: ${receipt?.blockNumber ?? "n/a"}`);
        proposal = await governorContract.proposals(proposalId);
      } else {
        console.log(`[constitution] proposal ${proposalId} already executed`);
      }
    } else {
      const remaining = eta - now;
      executeError = `eta_not_reached:${remaining}s`;
      console.log(
        `[constitution] execution delayed; eta not reached (eta=${eta}, now=${now}, remaining=${remaining}s)`
      );
    }
  } else {
    console.log("[constitution] AUTO_EXECUTE disabled; skipping execution step");
  }

  const payload = {
    proposalId: proposalId.toString(),
    governor,
    executor: executorAddress,
    queued: proposal.queued,
    executed: proposal.executed,
    queueTxHash: queuedTxHash,
    executeTxHash: executedTxHash,
    eta: eta.toString(),
    now: now.toString(),
    executeError,
    recordedAt: new Date().toISOString()
  };

  const outputPath = process.env.AI_CONSTITUTION_EXEC_REPORT || DEFAULT_EXEC_REPORT_PATH;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[constitution] execution report: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
