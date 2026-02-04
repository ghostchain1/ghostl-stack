/* eslint-disable no-console */
import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

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

  if (!initialExecutor || !ethers.isAddress(initialExecutor)) {
    throw new Error("Missing executor for RunLog (set RUNLOG_EXECUTOR or EXECUTOR_ADDRESS_L1 in env)");
  }

  const RunLog = await ethers.getContractFactory("RunLog");
  const runLog = await RunLog.deploy(initialExecutor);
  await runLog.waitForDeployment();

  const address = await runLog.getAddress();
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
