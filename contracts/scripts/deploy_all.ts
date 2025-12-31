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
  const relayerAddr = await l3Signer.getAddress();

  const setRelayerTx = await bridge.setRelayer(relayerAddr);
  await setRelayerTx.wait();
  console.log("Bridge relayer (L2):", relayerAddr);

  // Deploy optimistic settlement contracts:
  // - L2 batches posted to L1 (Anvil)
  // - L3 batches posted to L2 (GhostL2)
  const l1Rpc = process.env.RPC_L1 ?? "http://localhost:8545";
  const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
  const l1Signer = new ethers.Wallet(relayerKey, l1Provider);

  const Rollup = await ethers.getContractFactory("OptimisticRollup");
  const challengePeriodSeconds = 30;

  const l1Rollup = await Rollup.connect(l1Signer).deploy(7192, challengePeriodSeconds, await l1Signer.getAddress());
  await l1Rollup.waitForDeployment();
  const l1RollupAddr = await l1Rollup.getAddress();
  console.log("OptimisticRollup L2->L1 (L1):", l1RollupAddr);

  const l2Rollup = await Rollup.connect(l2[0]).deploy(7393, challengePeriodSeconds, await l2[0].getAddress());
  await l2Rollup.waitForDeployment();
  const l2RollupAddr = await l2Rollup.getAddress();
  console.log("OptimisticRollup L3->L2 (L2):", l2RollupAddr);

  const Inbox = await ethers.getContractFactory("L3Inbox");
  const inbox = await Inbox.connect(l3Signer).deploy(relayerAddr);
  await inbox.waitForDeployment();
  const inboxAddr = await inbox.getAddress();
  console.log("L3Inbox (L3):", inboxAddr);

  const Factory = await ethers.getContractFactory("L3BridgedTokenFactory");
  const factory = await Factory.connect(l3Signer).deploy(relayerAddr);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("L3BridgedTokenFactory (L3):", factoryAddr);

  // Deploy a default bridged token for the demo GhostTokenL2.
  const l2Name = await l2Token.name();
  const l2Symbol = await l2Token.symbol();
  const l2Decimals = await l2Token.decimals();
  const l3Name = `${l2Name} (L3)`;
  const l3Symbol = `${l2Symbol}L3`;
  const deployTokenTx = await factory.getOrDeployBridgedToken(l2TokenAddr, l3Name, l3Symbol, l2Decimals);
  const deployTokenRcpt = await deployTokenTx.wait();
  const deployed = deployTokenRcpt?.logs
    .map((l) => {
      try {
        return factory.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((e) => e?.name === "BridgedTokenDeployed");
  const l3TokenAddr = String(deployed?.args?.l3Token ?? "");
  console.log("L3BridgedToken (L3, default):", l3TokenAddr);

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
    `GRAPH_WINDOW_SECONDS=3600`,
    `ALERT_MIN_RISK=70`,
    `ADMIN_TOKEN=`,
    `ALLOW_INSECURE_ADMIN=0`,
    `L2_TOKEN_ADDRESS=${l2TokenAddr}`,
    `START_BLOCK=`
  ].join("\n") + "\n";

  await fs.writeFile(envPath, env, "utf8");
  console.log("Wrote:", envPath);

  const relayerEnvPath = "/workspaces/ghostl-stack/services/ghost-relayer/.env";
  const relayerEnv = [
    `PORT=7171`,
    `RPC_L1=http://localhost:8545`,
    `RPC_L2=http://localhost:9545`,
    `RPC_L3=http://localhost:10545`,
    `BRIDGE_L2L3_ADDRESS=${bridgeAddr}`,
    `L1_ROLLUP_L2_ADDRESS=${l1RollupAddr}`,
    `L2_ROLLUP_L3_ADDRESS=${l2RollupAddr}`,
    `L3_INBOX_ADDRESS=${inboxAddr}`,
    `L3_TOKEN_FACTORY_ADDRESS=${factoryAddr}`,
    `L3_TOKEN_ADDRESS=${l3TokenAddr}`,
    `RELAYER_PRIVATE_KEY=`,
    `L2_RELAYER_PRIVATE_KEY=`,
    `L2_TOKEN_ADDRESS=${l2TokenAddr}`,
    `START_BLOCK=`
  ].join("\n") + "\n";

  await fs.writeFile(relayerEnvPath, relayerEnv, "utf8");
  console.log("Wrote:", relayerEnvPath);

  const proposerDir = "/workspaces/ghostl-stack/services/ghost-rollup-proposer";
  const proposerL2Path = `${proposerDir}/.env.l2`;
  const proposerL3Path = `${proposerDir}/.env.l3`;
  const proposerL2Env = [
    `PORT=7272`,
    `RPC_SETTLEMENT=http://localhost:8545`,
    `RPC_CHILD=http://localhost:9545`,
    `ROLLUP_ADDRESS=${l1RollupAddr}`,
    `PROPOSER_PRIVATE_KEY=`,
    `CHALLENGE_PERIOD_SECONDS=${challengePeriodSeconds}`,
    `BATCH_SIZE=20`,
    `CONFIRMATIONS=0`
  ].join("\n") + "\n";
  const proposerL3Env = [
    `PORT=7373`,
    `RPC_SETTLEMENT=http://localhost:9545`,
    `RPC_CHILD=http://localhost:10545`,
    `ROLLUP_ADDRESS=${l2RollupAddr}`,
    `PROPOSER_PRIVATE_KEY=`,
    `CHALLENGE_PERIOD_SECONDS=${challengePeriodSeconds}`,
    `BATCH_SIZE=20`,
    `CONFIRMATIONS=0`
  ].join("\n") + "\n";
  await fs.mkdir(proposerDir, { recursive: true });
  await fs.writeFile(proposerL2Path, proposerL2Env, "utf8");
  await fs.writeFile(proposerL3Path, proposerL3Env, "utf8");
  console.log("Wrote:", proposerL2Path);
  console.log("Wrote:", proposerL3Path);

  console.log("\nNext:");
  console.log("1) Add PRIVATE_KEY in services/ghost-guard/.env (use a funded key on L2)");
  console.log("2) Add RELAYER_PRIVATE_KEY in services/ghost-relayer/.env (use a funded key on L3)");
  console.log("3) Add L2_RELAYER_PRIVATE_KEY in services/ghost-relayer/.env (funded on L2 for finalization / releases)");
  console.log("4) Add PROPOSER_PRIVATE_KEY in services/ghost-rollup-proposer/.env.l2 and .env.l3 to post batches");
  console.log("5) Restart docker compose or run services locally");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
