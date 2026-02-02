import { ethers, network, artifacts } from "hardhat";
import path from "node:path";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function waitForReceipt(
  provider: ethers.JsonRpcProvider,
  hash: string,
  label: string,
  retries = 0,
  timeoutMs = 120_000
): Promise<ethers.TransactionReceipt | null> {
  const start = Date.now();
  while (true) {
    try {
      const rcpt = await provider.getTransactionReceipt(hash);
      if (rcpt) return rcpt;
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes("transaction indexing is in progress") || msg.includes("indexing is in progress")) {
        await sleep(1000);
        continue;
      }
      throw err;
    }
    await sleep(1000 + Math.min(retries, 10) * 500);
    retries++;
    if (Date.now() - start > timeoutMs) {
      console.warn(`Waited ${timeoutMs}ms for ${label} receipt ${hash}, continuing...`);
      return null;
    }
  }
}

async function waitForDeployment(
  contract: ethers.Contract,
  provider: ethers.JsonRpcProvider,
  label: string
): Promise<void> {
  const tx = contract.deploymentTransaction();
  if (!tx?.hash) {
    throw new Error(`Missing deployment transaction for ${label}`);
  }
  await waitForReceipt(provider, tx.hash, label);
}

async function main() {
  const GAS_LIMIT = BigInt(process.env.DEPLOY_GAS_LIMIT ?? "15000000");
  const MAX_FEE_PER_GAS = process.env.DEPLOY_MAX_FEE_PER_GAS ? BigInt(process.env.DEPLOY_MAX_FEE_PER_GAS) : undefined;
  const MAX_PRIORITY_FEE_PER_GAS = process.env.DEPLOY_PRIORITY_FEE_PER_GAS
    ? BigInt(process.env.DEPLOY_PRIORITY_FEE_PER_GAS)
    : undefined;
  const L3_GAS_PRICE = process.env.DEPLOY_L3_GAS_PRICE ? BigInt(process.env.DEPLOY_L3_GAS_PRICE) : undefined;
  const txOpts =
    MAX_FEE_PER_GAS !== undefined && MAX_PRIORITY_FEE_PER_GAS !== undefined
      ? { gasLimit: GAS_LIMIT, maxFeePerGas: MAX_FEE_PER_GAS, maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS }
      : { gasLimit: GAS_LIMIT };
  const l3TxOpts = L3_GAS_PRICE !== undefined ? { gasLimit: GAS_LIMIT, gasPrice: L3_GAS_PRICE } : txOpts;
  console.log(
    `Using GAS_LIMIT=${GAS_LIMIT.toString()} maxFeePerGas=${MAX_FEE_PER_GAS ?? "default"} priorityFee=${MAX_PRIORITY_FEE_PER_GAS ?? "default"}`
  );
  const ROOT = process.env.ROOT_DIR ?? path.resolve(__dirname, "..", "..");
  const version = process.env.CONTRACTS_VERSION ?? "0.0.1";
  // Default to OP Stack devnet ports (Anvil L1 :28545, op-geth L2 :29545). L3 is optional; keep overrideable.
  const l2ChainId = Number(process.env.L2_CHAIN_ID ?? process.env.OP_L2_CHAIN_ID ?? network.config.chainId ?? 901);
  const l3ChainId = Number(process.env.L3_CHAIN_ID ?? process.env.OP_L3_CHAIN_ID ?? 903);
  const challengePeriodSeconds = Number(process.env.CHALLENGE_PERIOD_SECONDS ?? 30);
  const rpcL1 = process.env.RPC_L1 ?? "http://localhost:28545";
  const rpcL2Public =
    process.env.RPC_L2 ??
    (typeof (network.config as any)?.url === "string" ? String((network.config as any).url) : "http://localhost:29545");
  const rpcL3Public = process.env.RPC_L3 ?? "http://localhost:39545";

  console.log(
    `Config -> L2 chainId=${l2ChainId}, L3 chainId=${l3ChainId}, challengePeriodSeconds=${challengePeriodSeconds}`
  );
  const outputDir = process.env.OUTPUT_DIR ?? path.resolve(__dirname, "..", "deployments", network.name);
  await fs.mkdir(outputDir, { recursive: true });
  const deployments: Record<string, { name: string; address: string; chainId: number; layer: string; abi: unknown; abiHash: string; version: string; deployedAt: string }[]> = {
    l1: [],
    l2: [],
    l3: []
  };

  const recordDeployment = async (layer: "l1" | "l2" | "l3", name: string, address: string, chainId: number) => {
    const artifact = await artifacts.readArtifact(name);
    const abiHash = crypto.createHash("sha256").update(JSON.stringify(artifact.abi)).digest("hex");
    deployments[layer].push({
      name,
      address,
      chainId,
      layer,
      abi: artifact.abi,
      abiHash,
      version,
      deployedAt: new Date().toISOString()
    });
  };

  // Deploy policy + bridge on L2 (GhostL2)
  const CANONICAL_GAS_TOKEN = process.env.CANONICAL_GAS_TOKEN ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const l2TokenAddr = process.env.L2_TOKEN_ADDRESS ?? process.env.L2_TOKEN ?? CANONICAL_GAS_TOKEN;
  const l2 = await ethers.getSigners();
  const l2Provider = l2[0].provider as ethers.JsonRpcProvider;
  const l2TokenCode = await l2Provider.getCode(l2TokenAddr);
  const l2TokenHasCode = !!l2TokenCode && l2TokenCode !== "0x";

  console.log(`Deploying to GhostL2 network (${network.name})...`);
  console.log("== Deploy GuardPolicy on L2 ==");
  const Policy = await ethers.getContractFactory("GuardPolicy");
  const policy = await Policy.connect(l2[0]).deploy(txOpts);
  await waitForDeployment(policy, l2[0].provider as ethers.JsonRpcProvider, "GuardPolicy");

  console.log("== Deploy L2L3Bridge on L2 ==");
  const Bridge = await ethers.getContractFactory("L2L3Bridge");
  const bridge = await Bridge.connect(l2[0]).deploy(await policy.getAddress(), txOpts);
  await waitForDeployment(bridge, l2[0].provider as ethers.JsonRpcProvider, "L2L3Bridge");

  const policyAddr = await policy.getAddress();
  const bridgeAddr = await bridge.getAddress();
  await recordDeployment("l2", "GuardPolicy", policyAddr, l2ChainId);
  await recordDeployment("l2", "L2L3Bridge", bridgeAddr, l2ChainId);

  console.log("GuardPolicy (L2):", policyAddr);
  console.log("L2L3Bridge (L2):", bridgeAddr);

  if (!l2TokenHasCode) {
    console.warn(
      `No ERC20 bytecode at L2_TOKEN_ADDRESS=${l2TokenAddr}. Skipping default token deploy (canonical gas token is assumed).`
    );
  } else {
    console.log(`Using existing L2 token at ${l2TokenAddr} (ERC20 bytecode detected).`);
  }

  console.log("== Deploy GhostNFT on L2 ==");
  const GhostNFT = await ethers.getContractFactory("GhostNFT");
  const l2NftName = process.env.L2_NFT_NAME ?? "GhostL2 NFT";
  const l2NftSymbol = process.env.L2_NFT_SYMBOL ?? "GL2NFT";
  const l2Nft = await GhostNFT.connect(l2[0]).deploy(l2NftName, l2NftSymbol, txOpts);
  await waitForDeployment(l2Nft, l2[0].provider as ethers.JsonRpcProvider, "GhostNFT L2");
  const l2NftAddr = await l2Nft.getAddress();
  await recordDeployment("l2", "GhostNFT", l2NftAddr, l2ChainId);
  console.log("GhostNFT (L2):", l2NftAddr);

  // Deploy inbox on L3 (GhostL3) using the same dev key by default.
  const l3Rpc = rpcL3Public;
  const relayerKey =
    process.env.RELAYER_PRIVATE_KEY ??
    process.env.DEPLOYER_PRIVATE_KEY ??
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  const l3Provider = new ethers.JsonRpcProvider(l3Rpc);
  const l3Signer = new ethers.Wallet(relayerKey, l3Provider);
  const relayerAddr = await l3Signer.getAddress();

  console.log("== Set bridge relayer on L2 ==");
  const setRelayerTx = await bridge.setRelayer(relayerAddr, txOpts);
  await waitForReceipt(l2[0].provider as ethers.JsonRpcProvider, setRelayerTx.hash, "Bridge.setRelayer");
  console.log("Bridge relayer (L2):", relayerAddr);

  // Deploy optimistic settlement contracts:
  // - L2 batches posted to L1 (Anvil)
  // - L3 batches posted to L2 (GhostL2)
  const l1Provider = new ethers.JsonRpcProvider(rpcL1);
  const l1Signer = new ethers.Wallet(relayerKey, l1Provider);
  const l1Address = await l1Signer.getAddress();
  let l1Nonce = await l1Provider.getTransactionCount(l1Address, "pending");
  const nextL1Nonce = () => l1Nonce++;

  const Rollup = await ethers.getContractFactory("OptimisticRollup");

  console.log("== Deploy OptimisticRollup L2->L1 on L1 ==");
  const l1Rollup = await Rollup.connect(l1Signer).deploy(
    l2ChainId,
    challengePeriodSeconds,
    l1Address,
    { ...txOpts, nonce: nextL1Nonce() }
  );
  await waitForDeployment(l1Rollup, l1Provider, "OptimisticRollup L2->L1");
  const l1RollupAddr = await l1Rollup.getAddress();
  const l1Network = await l1Provider.getNetwork();
  await recordDeployment("l1", "OptimisticRollup", l1RollupAddr, Number(l1Network.chainId));
  console.log("OptimisticRollup L2->L1 (L1):", l1RollupAddr);

  console.log("== Deploy GhostConstitution on L1 ==");
  const constitutionGovernance = process.env.CONSTITUTION_GOVERNANCE ?? (await l1Signer.getAddress());
  const constitutionVerifierAgent =
    process.env.CONSTITUTION_VERIFIER_AGENT ?? constitutionGovernance;
  const constitutionZkVerifier = process.env.CONSTITUTION_ZK_VERIFIER ?? ethers.ZeroAddress;
  const Constitution = await ethers.getContractFactory("GhostConstitution");
  const constitution = await Constitution.connect(l1Signer).deploy(
    constitutionGovernance,
    constitutionVerifierAgent,
    constitutionZkVerifier,
    { ...txOpts, nonce: nextL1Nonce() }
  );
  await waitForDeployment(constitution, l1Provider, "GhostConstitution");
  const constitutionAddr = await constitution.getAddress();
  await recordDeployment("l1", "GhostConstitution", constitutionAddr, Number(l1Network.chainId));
  console.log("GhostConstitution (L1):", constitutionAddr);

  console.log("== Deploy GhostNFT on L1 ==");
  const l1NftName = process.env.L1_NFT_NAME ?? "GhostChain NFT";
  const l1NftSymbol = process.env.L1_NFT_SYMBOL ?? "GL1NFT";
  const l1Nft = await GhostNFT.connect(l1Signer).deploy(l1NftName, l1NftSymbol, {
    ...txOpts,
    nonce: nextL1Nonce()
  });
  await waitForDeployment(l1Nft, l1Provider, "GhostNFT L1");
  const l1NftAddr = await l1Nft.getAddress();
  await recordDeployment("l1", "GhostNFT", l1NftAddr, Number(l1Network.chainId));
  console.log("GhostNFT (L1):", l1NftAddr);

  console.log("== Deploy OptimisticRollup L3->L2 on L2 ==");
  const l2Rollup = await Rollup.connect(l2[0]).deploy(
    l3ChainId,
    challengePeriodSeconds,
    await l2[0].getAddress(),
    txOpts
  );
  await waitForDeployment(l2Rollup, l2[0].provider as ethers.JsonRpcProvider, "OptimisticRollup L3->L2");
  const l2RollupAddr = await l2Rollup.getAddress();
  await recordDeployment("l2", "OptimisticRollup", l2RollupAddr, l2ChainId);
  console.log("OptimisticRollup L3->L2 (L2):", l2RollupAddr);

  console.log("== Deploy L3Inbox on L3 ==");
  const Inbox = await ethers.getContractFactory("L3Inbox");
  const inbox = await Inbox.connect(l3Signer).deploy(relayerAddr, l3TxOpts);
  await waitForDeployment(inbox, l3Provider, "L3Inbox");
  const inboxAddr = await inbox.getAddress();
  await recordDeployment("l3", "L3Inbox", inboxAddr, l3ChainId);
  console.log("L3Inbox (L3):", inboxAddr);

  console.log("== Deploy L3BridgedTokenFactory on L3 ==");
  const Factory = await ethers.getContractFactory("L3BridgedTokenFactory");
  const factory = await Factory.connect(l3Signer).deploy(relayerAddr, l3TxOpts);
  await waitForDeployment(factory, l3Provider, "L3BridgedTokenFactory");
  const factoryAddr = await factory.getAddress();
  await recordDeployment("l3", "L3BridgedTokenFactory", factoryAddr, l3ChainId);
  console.log("L3BridgedTokenFactory (L3):", factoryAddr);

  console.log("== Deploy GhostNFT on L3 ==");
  const l3NftName = process.env.L3_NFT_NAME ?? "GhostL3 NFT";
  const l3NftSymbol = process.env.L3_NFT_SYMBOL ?? "GL3NFT";
  const l3Nft = await GhostNFT.connect(l3Signer).deploy(l3NftName, l3NftSymbol, l3TxOpts);
  await waitForDeployment(l3Nft, l3Provider, "GhostNFT L3");
  const l3NftAddr = await l3Nft.getAddress();
  await recordDeployment("l3", "GhostNFT", l3NftAddr, l3ChainId);
  console.log("GhostNFT (L3):", l3NftAddr);

  // Deploy a default bridged token when the L2 token has ERC20 bytecode.
  let l3TokenAddr = "";
  if (l2TokenHasCode) {
    try {
      const l2Token = await ethers.getContractAt("src/common/ERC20.sol:ERC20", l2TokenAddr, l2[0]);
      const l2Name = await l2Token.name();
      const l2Symbol = await l2Token.symbol();
      const l2Decimals = await l2Token.decimals();
      const l3Name = `${l2Name} (L3)`;
      const l3Symbol = `${l2Symbol}L3`;
      const deployTokenTx = await factory.getOrDeployBridgedToken(
        l2TokenAddr,
        l3Name,
        l3Symbol,
        l2Decimals,
        l3TxOpts
      );
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
      l3TokenAddr = String(deployed?.args?.l3Token ?? "");
      console.log("L3BridgedToken (L3, default):", l3TokenAddr);
      if (l3TokenAddr) {
        await recordDeployment("l3", "L3BridgedToken", l3TokenAddr, l3ChainId);
      }
    } catch (err) {
      console.warn("Skipping default L3 bridged token: unable to query L2 token metadata.", err);
    }
  } else {
    console.warn("Skipping default L3 bridged token: no ERC20 bytecode at L2_TOKEN_ADDRESS.");
  }

  // Write addresses for ghost-guard env
  const envPath = path.join(ROOT, "services/ghost-guard/.env");
  const env = [
    `PORT=7070`,
    `RPC_L1=${rpcL1}`,
    `RPC_L2=${rpcL2Public}`,
    `RPC_L3=${rpcL3Public}`,
    `GUARD_POLICY_ADDRESS=${policyAddr}`,
    `BRIDGE_L2L3_ADDRESS=${bridgeAddr}`,
    `PRIVATE_KEY=`,
    `AI_SIGNER_PRIVATE_KEY=`,
    `AI_GUARDIAN_L1_ADDRESS=`,
    `AI_GUARDIAN_L2_ADDRESS=`,
    `AI_GUARDIAN_L3_ADDRESS=`,
    `AI_CONSENSUS_MODE=enforce`,
    `AI_CONSENSUS_FAIL_OPEN=0`,
    `AI_MODEL_ID=GHOST_AI_CONSENSUS_V1`,
    `AI_CONFIDENCE_BPS=9000`,
    `AI_ATTEST_TTL_SECONDS=300`,
    `AI_RISK_REVIEW_BPS=5000`,
    `AI_RISK_BLOCK_BPS=8000`,
    `AI_REVIEW_DELAY_SECONDS=60`,
    `AI_WAIT_CONFIRMATIONS=0`,
    `AI_DEFAULT_LAYER=l2`,
    `AI_ROLE_LAYER_MAP=batcher:l1,proposer:l1`,
    `GRAPH_WINDOW_SECONDS=3600`,
    `ALERT_MIN_RISK=70`,
    `ADMIN_TOKEN=`,
    `ALLOW_INSECURE_ADMIN=0`,
    `L2_TOKEN_ADDRESS=${l2TokenAddr}`,
    `START_BLOCK=`
  ].join("\n") + "\n";

  await fs.writeFile(envPath, env, "utf8");
  console.log("Wrote:", envPath);

  const relayerEnvPath = path.join(ROOT, "services/ghost-relayer/.env");
  const relayerEnv = [
    `PORT=7171`,
    `RPC_L1=${rpcL1}`,
    `RPC_L2=${rpcL2Public}`,
    `RPC_L3=${rpcL3Public}`,
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

  const proposerDir = path.join(ROOT, "services/ghost-rollup-proposer");
  const proposerL2Path = `${proposerDir}/.env.l2`;
  const proposerL3Path = `${proposerDir}/.env.l3`;
  const proposerL2Env = [
    `PORT=7272`,
    `RPC_SETTLEMENT=${rpcL1}`,
    `RPC_CHILD=${rpcL2Public}`,
    `ROLLUP_ADDRESS=${l1RollupAddr}`,
    `PROPOSER_PRIVATE_KEY=`,
    `CHALLENGE_PERIOD_SECONDS=${challengePeriodSeconds}`,
    `BATCH_SIZE=20`,
    `CONFIRMATIONS=0`
  ].join("\n") + "\n";
  const proposerL3Env = [
    `PORT=7373`,
    `RPC_SETTLEMENT=${rpcL2Public}`,
    `RPC_CHILD=${rpcL3Public}`,
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

  const challengerDir = path.join(ROOT, "services/ghost-rollup-challenger");
  const challengerL2Path = `${challengerDir}/.env.l2`;
  const challengerL3Path = `${challengerDir}/.env.l3`;
  const challengerL2Env = [
    `PORT=7282`,
    `RPC_SETTLEMENT=${rpcL1}`,
    `RPC_CHILD=${rpcL2Public}`,
    `ROLLUP_ADDRESS=${l1RollupAddr}`,
    `CHALLENGER_PRIVATE_KEY=`,
    `CONFIRMATIONS=0`
  ].join("\n") + "\n";
  const challengerL3Env = [
    `PORT=7383`,
    `RPC_SETTLEMENT=${rpcL2Public}`,
    `RPC_CHILD=${rpcL3Public}`,
    `ROLLUP_ADDRESS=${l2RollupAddr}`,
    `CHALLENGER_PRIVATE_KEY=`,
    `CONFIRMATIONS=0`
  ].join("\n") + "\n";
  await fs.mkdir(challengerDir, { recursive: true });
  await fs.writeFile(challengerL2Path, challengerL2Env, "utf8");
  await fs.writeFile(challengerL3Path, challengerL3Env, "utf8");
  console.log("Wrote:", challengerL2Path);
  console.log("Wrote:", challengerL3Path);

  const writeLayer = async (layer: "l1" | "l2" | "l3") => {
    const filePath = path.join(outputDir, `${layer}.json`);
    await fs.writeFile(filePath, JSON.stringify({ network: network.name, layer, contracts: deployments[layer] }, null, 2));
    console.log("Wrote:", filePath);
  };
  await writeLayer("l1");
  await writeLayer("l2");
  await writeLayer("l3");

  const rollupConfig = {
    l1: { rollup: l1RollupAddr, chainId: Number(l1Network.chainId) },
    l2: { rollup: l2RollupAddr, chainId: l2ChainId },
    l3: { inbox: inboxAddr, factory: factoryAddr, chainId: l3ChainId }
  };
  await fs.writeFile(path.join(outputDir, "rollup-config.json"), JSON.stringify(rollupConfig, null, 2));
  const chainsRoot = path.resolve(ROOT, "chains");
  await fs.mkdir(path.join(chainsRoot, "l2"), { recursive: true });
  await fs.mkdir(path.join(chainsRoot, "l3"), { recursive: true });
  await fs.writeFile(path.join(chainsRoot, "l2", "rollup.json"), JSON.stringify(rollupConfig.l2, null, 2));
  await fs.writeFile(path.join(chainsRoot, "l3", "rollup.json"), JSON.stringify(rollupConfig.l3, null, 2));

  console.log("\nNext:");
  console.log("1) Add PRIVATE_KEY in services/ghost-guard/.env (use a funded key on L2)");
  console.log("2) Add RELAYER_PRIVATE_KEY in services/ghost-relayer/.env (use a funded key on L3)");
  console.log("3) Add L2_RELAYER_PRIVATE_KEY in services/ghost-relayer/.env (funded on L2 for finalization / releases)");
  console.log("4) Add PROPOSER_PRIVATE_KEY in services/ghost-rollup-proposer/.env.l2 and .env.l3 to post batches");
  console.log("5) Add CHALLENGER_PRIVATE_KEY in services/ghost-rollup-challenger/.env.l2 and .env.l3 (optional)");
  console.log("6) Restart docker compose or run services locally");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
