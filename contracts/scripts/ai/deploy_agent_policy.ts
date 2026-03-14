/* eslint-disable no-console */
import { ghost } from "ghost";

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_L1 = process.env.RPC_L1 ?? "http://localhost:18545";

const GOVERNOR_ADDRESS = process.env.GOVERNOR_ADDRESS ?? "";
const TIMELOCK_ADDRESS = process.env.TIMELOCK_ADDRESS ?? "0x0000000000000000000000000000000000000000";

async function main() {
  if (!ghost.isAddress(GOVERNOR_ADDRESS)) {
    throw new Error("GOVERNOR_ADDRESS required");
  }
  if (!DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY required (refusing to use a built-in dev key)");
  }
  const provider = new ghost.JsonRpcProvider(RPC_L1);
  const signer = new ghost.Wallet(DEPLOYER_PRIVATE_KEY, provider);
  const artifact = await import(
    "../../artifacts/src/ai/AgentGovernancePolicy.sol/AgentGovernancePolicy.json",
    { assert: { type: "json" } }
  );
  const factory = new ghost.ContractFactory(artifact.default.abi, artifact.default.bytecode, signer);
  const contract = await factory.deploy(GOVERNOR_ADDRESS, TIMELOCK_ADDRESS);
  await contract.waitForDeployment();
  console.log("AgentGovernancePolicy deployed:", await contract.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
