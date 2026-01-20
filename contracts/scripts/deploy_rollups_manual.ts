import { ethers } from "ethers";
import path from "node:path";
import { promises as fs } from "node:fs";
import "dotenv/config";

async function loadArtifact(name: string) {
  const candidates = [
    path.join(__dirname, "..", "artifacts", "contracts", `${name}.sol`, `${name}.json`),
    path.join(__dirname, "..", "artifacts", "src", `${name}.sol`, `${name}.json`)
  ];
  for (const artifactPath of candidates) {
    try {
      const raw = await fs.readFile(artifactPath, "utf8");
      return JSON.parse(raw);
    } catch {
      // try next path
    }
  }
  throw new Error(`Missing artifact for ${name}; run npm run build in ./contracts`);
}

async function assertCode(provider: ethers.JsonRpcProvider, address: string, label: string) {
  const code = await provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`No code at ${label} address ${address}`);
  }
}

async function main() {
  const gasLimit = BigInt(process.env.DEPLOY_GAS_LIMIT ?? "20000000");
  const maxFeePerGas = process.env.DEPLOY_MAX_FEE_PER_GAS ? BigInt(process.env.DEPLOY_MAX_FEE_PER_GAS) : undefined;
  const maxPriorityFeePerGas = process.env.DEPLOY_PRIORITY_FEE_PER_GAS
    ? BigInt(process.env.DEPLOY_PRIORITY_FEE_PER_GAS)
    : undefined;
  const l1Rpc = process.env.RPC_L1 ?? "http://localhost:18545";
  const l2Rpc = process.env.RPC_L2 ?? "http://localhost:29547";
  const l3Rpc = process.env.RPC_L3 ?? "http://localhost:39545";
  const l2ChainId = Number(process.env.L2_CHAIN_ID ?? "901");
  const l3ChainId = Number(process.env.L3_CHAIN_ID ?? "902");
  const challengePeriodSeconds = Number(process.env.CHALLENGE_PERIOD_SECONDS ?? "30");
  const relayerKey =
    process.env.RELAYER_PRIVATE_KEY ??
    process.env.DEPLOYER_PRIVATE_KEY ??
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const l2TokenAddr =
    process.env.L2_TOKEN_ADDRESS ??
    process.env.L2_TOKEN ?? // fallback
    "";
  const existingL1Rollup = process.env.L1_ROLLUP_L2_ADDRESS;
  const existingL2Rollup = process.env.L2_ROLLUP_L3_ADDRESS;
  const existingInbox = process.env.L3_INBOX_ADDRESS;
  const existingFactory = process.env.L3_TOKEN_FACTORY_ADDRESS;
  const existingL3Token = process.env.L3_TOKEN_ADDRESS;

  if (!l2TokenAddr) {
    throw new Error("Missing L2_TOKEN_ADDRESS env (GhostTokenL2 address)");
  }

  console.log("RPCs:", { l1Rpc, l2Rpc, l3Rpc });
  console.log("Config:", {
    gasLimit: gasLimit.toString(),
    maxFeePerGas: maxFeePerGas?.toString() ?? null,
    maxPriorityFeePerGas: maxPriorityFeePerGas?.toString() ?? null,
    l2ChainId,
    l3ChainId,
    challengePeriodSeconds
  });

  const txOpts =
    maxFeePerGas !== undefined && maxPriorityFeePerGas !== undefined
      ? { gasLimit, maxFeePerGas, maxPriorityFeePerGas }
      : { gasLimit };

  const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
  const l2Provider = new ethers.JsonRpcProvider(l2Rpc);
  const l3Provider = new ethers.JsonRpcProvider(l3Rpc);

  const l1Signer = new ethers.Wallet(relayerKey, l1Provider);
  const l2Signer = new ethers.Wallet(relayerKey, l2Provider);
  const l3Signer = new ethers.Wallet(relayerKey, l3Provider);

  const rollupArtifact = await loadArtifact("OptimisticRollup");
  const inboxArtifact = await loadArtifact("L3Inbox");
  const factoryArtifact = await loadArtifact("L3BridgedTokenFactory");
  const l2TokenArtifact = await loadArtifact("GhostTokenL2");

  const rollupFactoryL1 = new ethers.ContractFactory(
    rollupArtifact.abi,
    rollupArtifact.bytecode,
    l1Signer
  );
  const rollupFactoryL2 = new ethers.ContractFactory(
    rollupArtifact.abi,
    rollupArtifact.bytecode,
    l2Signer
  );

  let l1RollupAddr = existingL1Rollup;
  if (l1RollupAddr) {
    await assertCode(l1Provider, l1RollupAddr, "L1 rollup");
  } else {
    console.log("== Deploy OptimisticRollup L2->L1 on L1 ==");
    const l1Rollup = await rollupFactoryL1.deploy(
      l2ChainId,
      challengePeriodSeconds,
      await l1Signer.getAddress(),
      txOpts
    );
    await l1Rollup.waitForDeployment();
    l1RollupAddr = await l1Rollup.getAddress();
    console.log("OptimisticRollup L2->L1 (L1):", l1RollupAddr);
  }

  let l2RollupAddr = existingL2Rollup;
  if (l2RollupAddr) {
    await assertCode(l2Provider, l2RollupAddr, "L2 rollup");
  } else {
    console.log("== Deploy OptimisticRollup L3->L2 on L2 ==");
    const l2Rollup = await rollupFactoryL2.deploy(
      l3ChainId,
      challengePeriodSeconds,
      await l2Signer.getAddress(),
      txOpts
    );
    await l2Rollup.waitForDeployment();
    l2RollupAddr = await l2Rollup.getAddress();
    console.log("OptimisticRollup L3->L2 (L2):", l2RollupAddr);
  }

  let inboxAddr = existingInbox;
  if (inboxAddr) {
    await assertCode(l3Provider, inboxAddr, "L3 inbox");
  } else {
    console.log("== Deploy L3Inbox on L3 ==");
    const inboxFactory = new ethers.ContractFactory(inboxArtifact.abi, inboxArtifact.bytecode, l3Signer);
    const inbox = await inboxFactory.deploy(await l3Signer.getAddress(), txOpts);
    await inbox.waitForDeployment();
    inboxAddr = await inbox.getAddress();
    console.log("L3Inbox (L3):", inboxAddr);
  }

  let factoryAddr = existingFactory;
  if (factoryAddr) {
    await assertCode(l3Provider, factoryAddr, "L3 token factory");
  } else {
    console.log("== Deploy L3BridgedTokenFactory on L3 ==");
    const factoryFactory = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, l3Signer);
    const factory = await factoryFactory.deploy(await l3Signer.getAddress(), txOpts);
    await factory.waitForDeployment();
    factoryAddr = await factory.getAddress();
    console.log("L3BridgedTokenFactory (L3):", factoryAddr);
  }

  let l3TokenAddr = existingL3Token;
  if (!l3TokenAddr) {
    console.log("== Deploy default L3 bridged token for GhostTokenL2 ==");
    const l2Token = new ethers.Contract(l2TokenAddr, l2TokenArtifact.abi, l2Provider);
    const l2Name = await l2Token.name();
    const l2Symbol = await l2Token.symbol();
    const l2Decimals = await l2Token.decimals();
    const l3Name = `${l2Name} (L3)`;
    const l3Symbol = `${l2Symbol}L3`;
    const factory = new ethers.Contract(factoryAddr!, factoryArtifact.abi, l3Signer) as ethers.Contract & {
      getOrDeployBridgedToken: (
        l2Token: string,
        name: string,
        symbol: string,
        decimals: number,
        opts?: ethers.TransactionRequest
      ) => Promise<ethers.ContractTransactionResponse>;
    };
    const deployTokenTx = await factory.getOrDeployBridgedToken(l2TokenAddr, l3Name, l3Symbol, l2Decimals, txOpts);
    const deployTokenRcpt = await deployTokenTx.wait();
    const deployed = deployTokenRcpt?.logs
      .map((log: ethers.Log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((entry) => entry?.name === "BridgedTokenDeployed");
    l3TokenAddr = String(deployed?.args?.l3Token ?? "");
    console.log("L3BridgedToken (L3, default):", l3TokenAddr);
  } else {
    await assertCode(l3Provider, l3TokenAddr, "L3 bridged token");
  }

  console.log("Summary:");
  console.log({
    l1RollupAddr,
    l2RollupAddr,
    inboxAddr,
    factoryAddr,
    l3TokenAddr
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
