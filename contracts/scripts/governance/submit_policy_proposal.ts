/* eslint-disable no-console */
import { ghost } from "ghost";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const STACK_ENV_PATH = path.join(REPO_ROOT, "services", "stack.env");
const L3_ENV_PATH = path.join(REPO_ROOT, "infra", "opstack", ".env.l3");

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return dotenv.parse(raw);
  } catch {
    return {};
  }
}

function resolveEnvValue(
  directKey: string,
  fallbackKeys: readonly string[],
  fileEnv: Record<string, string>
): string {
  const direct = process.env[directKey];
  if (direct && direct.length > 0) return direct;
  for (const key of fallbackKeys) {
    const candidate = process.env[key] || fileEnv[key];
    if (candidate && candidate.length > 0) return candidate;
  }
  return "";
}

function parseArgs(argv: string[]) {
  const out: any = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") out.file = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help") out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: ts-node scripts/governance/submit_policy_proposal.ts --file <path> [--dry-run]");
    process.exit(0);
  }

  if (!args.file) {
    throw new Error("Missing --file <path to policy-proposal-*.json>");
  }

  const filePath = path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file);
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (!payload?.proposal?.target || !payload?.proposal?.data) {
    throw new Error("Invalid proposal JSON: missing proposal.target or proposal.data");
  }

  const envFromFiles = {
    ...loadEnvFile(L3_ENV_PATH),
    ...loadEnvFile(STACK_ENV_PATH),
  };

  const GOVERNOR = payload?.meta?.governor || resolveEnvValue(
    "GOVERNOR",
    ["GOVERNOR_ADDRESS_L1", "AI_CONSTITUTION_GOVERNOR", "GOVERNANCE_CONTRACT_ADDRESS"],
    envFromFiles
  );

  const RPC_URL = resolveEnvValue(
    "GOVERNANCE_RPC",
    ["POLICY_REGISTRY_RPC", "GOVERNANCE_RPC_L1"],
    envFromFiles
  );

  const PRIVATE_KEY = resolveEnvValue(
    "PROPOSER_PRIVATE_KEY",
    ["PROPOSER_PRIVATE_KEY"],
    envFromFiles
  );

  if (!GOVERNOR || !ghost.isAddress(GOVERNOR)) {
    throw new Error("Missing GOVERNOR address (env GOVERNOR or stack.env GOVERNOR_ADDRESS_L1)");
  }
  if (!RPC_URL) {
    throw new Error("Missing RPC URL (env GOVERNANCE_RPC or stack.env GOVERNANCE_RPC_L1)");
  }
  if (!PRIVATE_KEY) {
    throw new Error("Missing proposer key (env PROPOSER_PRIVATE_KEY)");
  }

  const governorAbi = ["function propose(address target,uint256 value,bytes data) external returns (uint256)"];
  const provider = new ghost.JsonRpcProvider(RPC_URL);
  const wallet = new ghost.Wallet(PRIVATE_KEY, provider);
  const governor = new ghost.Contract(GOVERNOR, governorAbi, wallet);

  const target = payload.proposal.target;
  const value = BigInt(payload.proposal.value || "0");
  const data = payload.proposal.data;

  if (args.dryRun) {
    console.log("Dry run:");
    console.log(`Governor: ${GOVERNOR}`);
    console.log(`RPC: ${RPC_URL}`);
    console.log(`propose(target=${target}, value=${value.toString()}, data=${data.slice(0, 10)}...)`);
    process.exit(0);
  }

  const tx = await governor.propose(target, value, data);
  console.log(`Submitted proposal tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Mined in block: ${receipt?.blockNumber ?? "unknown"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
