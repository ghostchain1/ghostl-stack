import { ghost } from "hardhat";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = process.env.ROOT_DIR ?? path.resolve(__dirname, "..", "..");
  const outPath = path.join(root, ".tmp", "last_l3_bridge_deploy.json");

  const [deployer] = await ghost.getSigners();
  if (!deployer?.provider) {
    throw new Error("missing provider (check hardhat network RPC config)");
  }

  const net = await deployer.provider.getNetwork();
  const relayer = process.env.L3_RELAYER_ADDRESS ?? deployer.address;

  console.log("network:", { chainId: Number(net.chainId) });
  console.log("deployer:", deployer.address);
  console.log("relayer:", relayer);

  const Inbox = await ghost.getContractFactory("L3Inbox", deployer);
  const inbox = await Inbox.deploy(relayer);
  console.log("L3Inbox deploy tx:", inbox.deploymentTransaction()?.hash ?? "");
  await inbox.waitForDeployment();
  const inboxAddr = await inbox.getAddress();
  console.log("L3Inbox:", inboxAddr);

  const Factory = await ghost.getContractFactory("L3BridgedTokenFactory", deployer);
  const factory = await Factory.deploy(relayer);
  console.log("L3BridgedTokenFactory deploy tx:", factory.deploymentTransaction()?.hash ?? "");
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("L3BridgedTokenFactory:", factoryAddr);

  const out = {
    chainId: Number(net.chainId),
    deployer: deployer.address,
    relayer,
    inbox: inboxAddr,
    factory: factoryAddr
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("Wrote:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

