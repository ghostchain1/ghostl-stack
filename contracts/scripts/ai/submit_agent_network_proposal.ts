/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { ghost } from "@ghostchain/sdk";

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const RPC_L1 = process.env.RPC_L1 ?? "http://localhost:18545";
const GOVERNOR_ADDRESS = process.env.GOVERNOR_ADDRESS || "";

const INPUT_PATH =
  process.env.AGENT_PROPOSAL_OUTPUT ||
  path.join(process.cwd(), "contracts", "scripts", "ai", "agent_network_proposal.json");

const requireAddress = (name: string, value: string | undefined) => {
  if (!value || !ghost.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return ghost.getAddress(value);
};

async function main() {
  if (!DEPLOYER_PRIVATE_KEY) {
    throw new Error("missing_DEPLOYER_PRIVATE_KEY");
  }
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`proposal_file_missing:${INPUT_PATH}`);
  }

  const governor = requireAddress("GOVERNOR_ADDRESS", GOVERNOR_ADDRESS);
  const payload = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  const provider = new ghost.JsonRpcProvider(RPC_L1);
  const signer = new ghost.Wallet(DEPLOYER_PRIVATE_KEY, provider);
  const governorContract = new ghost.Contract(
    governor,
    ["function propose(address target,uint256 value,bytes data) external returns (uint256)"],
    signer
  );

  let target = payload?.executor?.target;
  let calldata = payload?.executor?.calldata;

  if (!target || !calldata) {
    const firstCall = payload?.calls?.[0];
    if (!firstCall) throw new Error("proposal_payload_missing_calls");
    target = firstCall.target;
    calldata = firstCall.data;
    console.log("[agent-network] executor calldata missing; submitting first call only");
  }

  const tx = await governorContract.propose(target, 0, calldata);
  const receipt = await tx.wait();
  console.log("[agent-network] proposal tx:", tx.hash, "status:", receipt?.status);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
