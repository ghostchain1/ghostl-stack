/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const DEV_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const RPC_L1 = process.env.RPC_L1 ?? "http://localhost:18545";
const GOVERNOR_ADDRESS = process.env.GOVERNOR_ADDRESS;

const INPUT_PATH =
  process.env.RATIFICATION_OUTPUT_PATH ||
  path.join(process.cwd(), "contracts", "scripts", "treasury", "ratification_proposal.json");

function requireAddress(name: string, value: string | undefined) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return ethers.getAddress(value);
}

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`proposal_file_missing:${INPUT_PATH}`);
  }
  const raw = fs.readFileSync(INPUT_PATH, "utf8");
  const payload = JSON.parse(raw) as any;

  const governor = requireAddress("GOVERNOR_ADDRESS", GOVERNOR_ADDRESS);
  const provider = new ethers.JsonRpcProvider(RPC_L1);
  const signer = new ethers.Wallet(DEV_PRIVATE_KEY, provider);
  const governorContract = new ethers.Contract(
    governor,
    ["function propose(address target,uint256 value,bytes data) external returns (uint256)"],
    signer
  );

  let target = payload?.executor?.target as string | undefined;
  let calldata = payload?.executor?.calldata as string | undefined;

  if (!target || !calldata) {
    const firstCall = payload?.calls?.[0];
    if (!firstCall) {
      throw new Error("proposal_payload_missing_calls");
    }
    target = firstCall.target;
    calldata = firstCall.data;
    console.log("[ratification] executor calldata missing; submitting first call only");
  }

  console.log("[ratification] proposing target:", target);
  const tx = await governorContract.propose(target, 0, calldata);
  const receipt = await tx.wait();
  console.log("[ratification] proposal tx:", tx.hash, "status:", receipt?.status);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
