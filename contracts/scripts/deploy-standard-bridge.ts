import { ghost } from "hardhat";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

async function main() {
  const messenger = getEnv("MESSENGER");
  const remoteBridge = getEnv("REMOTE_BRIDGE");

  const [deployer] = await ghost.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Messenger: ${messenger}`);
  console.log(`Remote bridge: ${remoteBridge}`);

  const Bridge = await ghost.getContractFactory("StandardBridge");
  const bridge = await Bridge.deploy(messenger, remoteBridge);
  await bridge.waitForDeployment();

  console.log(`StandardBridge deployed at: ${bridge.target as string}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
