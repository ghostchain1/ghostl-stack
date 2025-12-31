import { ethers } from "hardhat";

async function main() {
  // Deploy policy + bridge on L2 (GhostL2)
  const l2 = await ethers.getSigners();

  console.log("Deploying to GhostL2...");
  const Policy = await ethers.getContractFactory("GuardPolicy");
  const policy = await Policy.connect(l2[0]).deploy();
  await policy.waitForDeployment();

  const Bridge = await ethers.getContractFactory("L2L3Bridge");
  const bridge = await Bridge.connect(l2[0]).deploy(await policy.getAddress());
  await bridge.waitForDeployment();

  const policyAddr = await policy.getAddress();
  const bridgeAddr = await bridge.getAddress();

  console.log("GuardPolicy (L2):", policyAddr);
  console.log("L2L3Bridge (L2):", bridgeAddr);

  const GhostToken = await ethers.getContractFactory("GhostTokenL2");
  const l2Token = await GhostToken.connect(l2[0]).deploy();
  await l2Token.waitForDeployment();
  const l2TokenAddr = await l2Token.getAddress();
  console.log("GhostTokenL2 (L2):", l2TokenAddr);

  // Deploy inbox on L3 (GhostL3) using the same dev key by default.
  const l3Rpc = process.env.RPC_L3 ?? "http://localhost:10545";
  const relayerKey =
    process.env.RELAYER_PRIVATE_KEY ??
    process.env.DEPLOYER_PRIVATE_KEY ??
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  const l3Provider = new ethers.JsonRpcProvider(l3Rpc);
  const l3Signer = new ethers.Wallet(relayerKey, l3Provider);
  const Inbox = await ethers.getContractFactory("L3Inbox");
  const inbox = await Inbox.connect(l3Signer).deploy(await l3Signer.getAddress());
  await inbox.waitForDeployment();
  const inboxAddr = await inbox.getAddress();
  console.log("L3Inbox (L3):", inboxAddr);

  const L3Token = await ethers.getContractFactory("L3BridgedToken");
  const l3Token = await L3Token.connect(l3Signer).deploy(await l3Signer.getAddress(), l2TokenAddr);
  await l3Token.waitForDeployment();
  const l3TokenAddr = await l3Token.getAddress();
  console.log("L3BridgedToken (L3):", l3TokenAddr);

  // Write addresses for ghost-guard env
  const fs = await import("node:fs/promises");
  const envPath = "/workspaces/ghostl-stack/services/ghost-guard/.env";
  const env = [
    `PORT=7070`,
    `RPC_L2=http://localhost:9545`,
    `RPC_L3=http://localhost:10545`,
    `GUARD_POLICY_ADDRESS=${policyAddr}`,
    `BRIDGE_L2L3_ADDRESS=${bridgeAddr}`,
    `PRIVATE_KEY=`,
    `L2_TOKEN_ADDRESS=${l2TokenAddr}`,
    `START_BLOCK=`
  ].join("\n") + "\n";

  await fs.writeFile(envPath, env, "utf8");
  console.log("Wrote:", envPath);

  const relayerEnvPath = "/workspaces/ghostl-stack/services/ghost-relayer/.env";
  const relayerEnv = [
    `PORT=7171`,
    `RPC_L2=http://localhost:9545`,
    `RPC_L3=http://localhost:10545`,
    `BRIDGE_L2L3_ADDRESS=${bridgeAddr}`,
    `L3_INBOX_ADDRESS=${inboxAddr}`,
    `L3_TOKEN_ADDRESS=${l3TokenAddr}`,
    `RELAYER_PRIVATE_KEY=`,
    `L2_TOKEN_ADDRESS=${l2TokenAddr}`,
    `START_BLOCK=`
  ].join("\n") + "\n";

  await fs.writeFile(relayerEnvPath, relayerEnv, "utf8");
  console.log("Wrote:", relayerEnvPath);

  console.log("\nNext:");
  console.log("1) Add PRIVATE_KEY in services/ghost-guard/.env (use a funded key on L2)");
  console.log("2) Add RELAYER_PRIVATE_KEY in services/ghost-relayer/.env (use a funded key on L3)");
  console.log("3) Restart docker compose or run services locally");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
