import { ghost } from "hardhat";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function main() {
  const messenger = getEnv("MESSENGER");
  const [deployer] = await ghost.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Messenger: ${messenger}`);

  const PingPong = await ghost.getContractFactory("PingPong");
  const pp = await PingPong.deploy(messenger);
  await pp.waitForDeployment();

  console.log(`PingPong deployed at: ${pp.target as string}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
