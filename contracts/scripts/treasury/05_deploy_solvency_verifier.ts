/* eslint-disable no-console */
import { ghost } from "hardhat";

async function main() {
  const governor = process.env.GOVERNOR_ADDRESS || process.env.TIMELOCK_ADDRESS || "";
  if (!governor || !ghost.isAddress(governor)) {
    throw new Error("set GOVERNOR_ADDRESS or TIMELOCK_ADDRESS");
  }
  const timelock = process.env.TIMELOCK_ADDRESS || ghost.ZeroAddress;

  const Verifier = await ghost.getContractFactory("SolvencyVerifier");
  const verifier = await Verifier.deploy(governor, timelock);
  await verifier.waitForDeployment();

  console.log(`SolvencyVerifier deployed: ${await verifier.getAddress()}`);
  console.log(`governor: ${governor}`);
  console.log(`timelock: ${timelock}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
