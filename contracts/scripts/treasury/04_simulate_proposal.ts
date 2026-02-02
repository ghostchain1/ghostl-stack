/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import hre from "hardhat";

const INPUT_PATH =
  process.env.RATIFICATION_OUTPUT_PATH ||
  path.join(process.cwd(), "contracts", "scripts", "treasury", "ratification_proposal.json");

const FORK_URL = process.env.TREASURY_FORK_URL || process.env.RPC_L1;
const EXECUTOR_ADDRESS = process.env.PROPOSAL_EXECUTOR_ADDRESS;

async function main() {
  if (!FORK_URL) {
    throw new Error("TREASURY_FORK_URL_or_RPC_L1_required");
  }
  if (!EXECUTOR_ADDRESS) {
    throw new Error("PROPOSAL_EXECUTOR_ADDRESS_required");
  }
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`proposal_file_missing:${INPUT_PATH}`);
  }

  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: FORK_URL } }]
  });

  const payload = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8")) as any;
  const calls = payload?.calls as Array<{ target: string; value: string | number | bigint; data: string }>;
  if (!calls || calls.length === 0) {
    throw new Error("proposal_calls_missing");
  }

  const executor = EXECUTOR_ADDRESS;
  await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [executor] });
  await hre.network.provider.request({
    method: "hardhat_setBalance",
    params: [executor, "0x3635C9ADC5DEA00000"]
  });

  const signer = await hre.ethers.getSigner(executor);

  for (let i = 0; i < calls.length; i += 1) {
    const call = calls[i];
    const tx = await signer.sendTransaction({
      to: call.target,
      data: call.data,
      value: call.value !== undefined ? BigInt(call.value) : 0n
    });
    const receipt = await tx.wait();
    if (receipt?.status !== 1n) {
      throw new Error(`simulation_failed_at_call_${i}`);
    }
  }

  console.log("[ratification] simulation ok; calls executed:", calls.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
