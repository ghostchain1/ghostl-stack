import { ethers } from "hardhat";

async function main(): Promise<void> {
  const governance = process.env.GHOSTLOAD_GOVERNANCE_ADDRESS;
  const guardian = process.env.GHOSTLOAD_GUARDIAN_ADDRESS;
  const timelockSeconds = Number(process.env.GHOSTLOAD_TIMELOCK_SECONDS ?? "86400");

  if (!governance || !guardian) {
    throw new Error("GHOSTLOAD_GOVERNANCE_ADDRESS and GHOSTLOAD_GUARDIAN_ADDRESS are required");
  }

  const Registry = await ethers.getContractFactory("GhostLoadParameterRegistry");
  const registry = await Registry.deploy(governance, timelockSeconds);
  await registry.waitForDeployment();

  const Pause = await ethers.getContractFactory("GhostLoadEmergencyPause");
  const pause = await Pause.deploy(guardian);
  await pause.waitForDeployment();

  console.log(JSON.stringify({
    registry: await registry.getAddress(),
    pause: await pause.getAddress(),
    governance,
    guardian,
    timelockSeconds
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
