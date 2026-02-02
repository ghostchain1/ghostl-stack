/* eslint-disable no-console */
import { ethers } from "ethers";

const DEV_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const RPC_L1 = process.env.RPC_L1 ?? "http://localhost:18545";

const GOVERNOR_ADDRESS = process.env.GOVERNOR_ADDRESS ?? "";
const TIMELOCK_ADDRESS = process.env.TIMELOCK_ADDRESS ?? "0x0000000000000000000000000000000000000000";

async function main() {
  if (!ethers.isAddress(GOVERNOR_ADDRESS)) {
    throw new Error("GOVERNOR_ADDRESS required");
  }
  const provider = new ethers.JsonRpcProvider(RPC_L1);
  const signer = new ethers.Wallet(DEV_PRIVATE_KEY, provider);
  const factory = new ethers.ContractFactory(
    ["constructor(address governor_, address timelock_)", "function governor() view returns (address)"],
    (await import("../../artifacts/src/security/SSHAccessRegistry.sol/SSHAccessRegistry.json", {
      assert: { type: "json" }
    })).default.bytecode,
    signer
  );
  const contract = await factory.deploy(GOVERNOR_ADDRESS, TIMELOCK_ADDRESS);
  await contract.waitForDeployment();
  console.log("SSHAccessRegistry deployed:", await contract.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
