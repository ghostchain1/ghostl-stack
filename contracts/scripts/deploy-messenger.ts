import { ghost } from "hardhat";

function getEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

async function main() {
  const parent = getEnv("PARENT_MESSENGER", "0x0000000000000000000000000000000000000000");
  const child = getEnv("CHILD_MESSENGER", "0x0000000000000000000000000000000000000000");

  const [deployer] = await ghost.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Parent messenger: ${parent}`);
  console.log(`Child messenger: ${child}`);

  const Messenger = await ghost.getContractFactory("XDomainMessenger");
  const messenger = await Messenger.deploy(parent, child);
  await messenger.waitForDeployment();

  console.log(`XDomainMessenger deployed at: ${messenger.target as string}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
