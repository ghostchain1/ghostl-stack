/* eslint-disable no-console */
import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const STACK_ENV_PATH = path.join(REPO_ROOT, "services", "stack.env");
const L3_ENV_PATH = path.join(REPO_ROOT, "infra", "opstack", ".env.l3");
const RUNLOG_SOURCE = path.join(REPO_ROOT, "contracts", "src", "governance", "RunLog.sol");

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

function upsertEnvLine(filePath: string, key: string, value: string) {
  const line = `${key}=${value}`;
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    content = "";
  }
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) {
    lines[idx] = line;
  } else {
    lines.push(line);
  }
  fs.writeFileSync(filePath, lines.join("\n").replace(/\n{3,}/g, "\n\n"));
}

async function main() {
  const envFromFiles = {
    ...loadEnvFile(L3_ENV_PATH),
    ...loadEnvFile(STACK_ENV_PATH),
  };

  const initialExecutor = resolveEnvValue(
    "RUNLOG_EXECUTOR",
    ["EXECUTOR_ADDRESS_L1", "AI_CONSTITUTION_EXECUTOR", "AI_PROPOSAL_EXECUTOR_ADDRESS"],
    envFromFiles
  );

  const rpcUrl = resolveEnvValue(
    "GOVERNANCE_RPC",
    ["GOVERNANCE_RPC_L1", "POLICY_REGISTRY_RPC"],
    envFromFiles
  );

  const privateKey = resolveEnvValue(
    "DEPLOYER_PRIVATE_KEY",
    ["DEPLOYER_PRIVATE_KEY", "PROPOSER_PRIVATE_KEY"],
    envFromFiles
  );

  if (!initialExecutor || !ethers.isAddress(initialExecutor)) {
    throw new Error("Missing executor for RunLog (set RUNLOG_EXECUTOR or EXECUTOR_ADDRESS_L1 in env)");
  }
  if (!rpcUrl) {
    throw new Error("Missing RPC URL (set GOVERNANCE_RPC or GOVERNANCE_RPC_L1)");
  }
  if (!privateKey) {
    throw new Error("Missing deployer key (set DEPLOYER_PRIVATE_KEY or PROPOSER_PRIVATE_KEY)");
  }

  const source = fs.readFileSync(RUNLOG_SOURCE, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      "RunLog.sol": { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors?.length) {
    const errors = output.errors.filter((e: any) => e.severity === "error");
    if (errors.length) {
      throw new Error(errors.map((e: any) => e.formattedMessage).join("\n"));
    }
  }
  const contractOutput = output.contracts["RunLog.sol"]["RunLog"];
  const abi = contractOutput.abi;
  const bytecode = `0x${contractOutput.evm.bytecode.object}`;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

  const contract = await factory.deploy(initialExecutor);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`RunLog deployed: ${address}`);
  console.log(`Executor: ${initialExecutor}`);

  upsertEnvLine(STACK_ENV_PATH, "RUN_LOG_ADDRESS", address);
  upsertEnvLine(L3_ENV_PATH, "RUN_LOG_ADDRESS", address);
  console.log(`Updated env: ${STACK_ENV_PATH}`);
  console.log(`Updated env: ${L3_ENV_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
