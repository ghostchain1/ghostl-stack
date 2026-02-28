/* eslint-disable no-console */
import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const STACK_ENV_PATH = path.join(REPO_ROOT, "services", "stack.env");
const L1_ENV_PATH = path.join(REPO_ROOT, "infra", "ghostchain", ".env");

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return dotenv.parse(raw);
  } catch {
    return {};
  }
}

function resolveEnvValue(directKey: string, fallbackKeys: readonly string[], fileEnv: Record<string, string>): string {
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
    ...loadEnvFile(L1_ENV_PATH),
    ...loadEnvFile(STACK_ENV_PATH)
  };

  const governor = resolveEnvValue("RELEASE_GATE_GOVERNOR", ["GOVERNOR_ADDRESS", "TIMELOCK_ADDRESS"], envFromFiles);
  const timelock = resolveEnvValue("RELEASE_GATE_TIMELOCK", ["TIMELOCK_ADDRESS", "TIMELOCK_ADDRESS_L1"], envFromFiles);
  const mainnetLaunchGateAddress = resolveEnvValue("MAINNET_LAUNCH_GATE_ADDRESS", ["MAINNET_LAUNCH_GATE_ADDRESS"], envFromFiles);

  if (!governor || !ethers.isAddress(governor)) {
    throw new Error("Missing RELEASE_GATE_GOVERNOR / GOVERNOR_ADDRESS");
  }
  if (!timelock || !ethers.isAddress(timelock)) {
    throw new Error("Missing RELEASE_GATE_TIMELOCK / TIMELOCK_ADDRESS");
  }
  if (!mainnetLaunchGateAddress || !ethers.isAddress(mainnetLaunchGateAddress)) {
    throw new Error("Missing MAINNET_LAUNCH_GATE_ADDRESS");
  }

  const ReleaseGate = await ethers.getContractFactory("ReleaseGate");
  const gate = await ReleaseGate.deploy(governor, timelock, mainnetLaunchGateAddress);
  await gate.waitForDeployment();

  const address = await gate.getAddress();
  console.log(`ReleaseGate deployed: ${address}`);
  console.log(`governor: ${governor}`);
  console.log(`timelock: ${timelock}`);
  console.log(`mainnetLaunchGate: ${mainnetLaunchGateAddress}`);

  upsertEnvLine(STACK_ENV_PATH, "MAINNET_RELEASE_GATE_ADDRESS", address);
  console.log(`Updated env: ${STACK_ENV_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
