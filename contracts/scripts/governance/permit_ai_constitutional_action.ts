/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { ghost } from "hardhat";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_REPORT_PATH = path.join(
  repoRoot,
  "contracts",
  "reports",
  "ai_constitutional_action_permit.json"
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

const proposalIdRaw = readEnv("CONSTITUTION_PROPOSAL_ID");
if (!proposalIdRaw) {
  throw new Error("missing_CONSTITUTION_PROPOSAL_ID");
}
const proposalId = Number(proposalIdRaw);
if (!Number.isFinite(proposalId) || proposalId < 0) {
  throw new Error(`invalid_CONSTITUTION_PROPOSAL_ID:${proposalIdRaw}`);
}

const executorAddress = readEnv("AI_CONSTITUTION_EXECUTOR") || "";
if (!executorAddress || !ghost.isAddress(executorAddress)) {
  throw new Error("missing_or_invalid_AI_CONSTITUTION_EXECUTOR");
}

const ACTION_GOVERNANCE = ghost.keccak256(
  ghost.toUtf8Bytes("ghost.governance.execute")
);

async function main() {
  const [signer] = await ghost.getSigners();
  const executor = new ghost.Contract(
    executorAddress,
    [
      "function queue(uint256) view returns (address target,uint256 value,bytes data,uint256 eta,bool executed)",
      "function constitutionalGuard() view returns (address)"
    ],
    signer
  );

  const queued = await executor.queue(proposalId);
  const guardAddress = await executor.constitutionalGuard();
  if (!guardAddress || guardAddress === ghost.ZeroAddress) {
    throw new Error("constitution_guard_missing");
  }

  const guard = new ghost.Contract(
    guardAddress,
    ["function constitution() view returns (address)"],
    signer
  );
  const constitutionAddress = await guard.constitution();
  if (!constitutionAddress || constitutionAddress === ghost.ZeroAddress) {
    throw new Error("constitution_missing");
  }

  const constitution = new ghost.Contract(
    constitutionAddress,
    ["function governance() view returns (address)", "function permitAction(bytes32,bool) external"],
    signer
  );

  const governance = await constitution.governance();
  if (governance.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`signer_not_constitution_governance:${signer.address}`);
  }

  const dataHash = ghost.keccak256(queued.data);
  const actionHash = ghost.keccak256(
    ghost.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "address", "uint256", "bytes32", "uint256"],
      [ACTION_GOVERNANCE, proposalId, queued.target, queued.value, dataHash, queued.eta]
    )
  );

  const tx = await constitution.permitAction(actionHash, true);
  const receipt = await tx.wait();

  const payload = {
    proposalId: proposalId.toString(),
    executor: executorAddress,
    constitutionalGuard: guardAddress,
    constitution: constitutionAddress,
    governance,
    actionHash,
    queue: {
      target: queued.target,
      value: queued.value.toString(),
      eta: queued.eta.toString(),
      dataHash
    },
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber ?? null,
    recordedAt: new Date().toISOString()
  };

  const outputPath = process.env.AI_CONSTITUTION_ACTION_PERMIT_REPORT || DEFAULT_REPORT_PATH;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[constitution] action permitted: ${actionHash}`);
  console.log(`[constitution] report: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
