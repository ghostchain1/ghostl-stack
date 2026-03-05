import { ghost } from "ghost";
import path from "node:path";
import { promises as fs } from "node:fs";
import "dotenv/config";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const nonceState = new Map<string, number>();

type ArtifactJson = {
  abi: ghost.InterfaceAbi;
  bytecode: string;
};

async function findArtifactJsonPath(rootDir: string, name: string): Promise<string | null> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findArtifactJsonPath(fullPath, name);
      if (nested) return nested;
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name !== `${name}.json`) continue;
    if (!rootDir.endsWith(`${name}.sol`)) continue;
    return fullPath;
  }
  return null;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

function normalizeAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!ghost.isAddress(trimmed)) {
    throw new Error(`invalid address: ${trimmed}`);
  }
  return ghost.getAddress(trimmed);
}

function ensureBytes32(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!ghost.isHexString(trimmed, 32)) {
    throw new Error(`${label} must be a 32-byte hex value`);
  }
  return trimmed;
}

async function loadArtifact(name: string): Promise<ArtifactJson> {
  const artifactsRoot = path.join(__dirname, "..", "artifacts");
  const candidates = [
    path.join(artifactsRoot, "contracts", `${name}.sol`, `${name}.json`),
    path.join(artifactsRoot, "src", `${name}.sol`, `${name}.json`),
    path.join(artifactsRoot, "src", "governance", "bridge", `${name}.sol`, `${name}.json`)
  ];
  for (const artifactPath of candidates) {
    try {
      const raw = await fs.readFile(artifactPath, "utf8");
      return JSON.parse(raw) as ArtifactJson;
    } catch {
      // try next path
    }
  }
  const discovered = await findArtifactJsonPath(artifactsRoot, name);
  if (discovered) {
    const raw = await fs.readFile(discovered, "utf8");
    return JSON.parse(raw) as ArtifactJson;
  }
  throw new Error(`Missing artifact for ${name}; run npm run build in ./contracts`);
}

async function assertCode(provider: ghost.JsonRpcProvider, address: string, label: string) {
  const code = await provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`No code at ${label} address ${address}`);
  }
}

async function nextNonce(provider: ghost.JsonRpcProvider, rpcUrl: string, signerAddress: string): Promise<number> {
  const key = `${rpcUrl.toLowerCase()}::${signerAddress.toLowerCase()}`;
  const cached = nonceState.get(key);
  if (cached !== undefined) {
    nonceState.set(key, cached + 1);
    return cached;
  }
  const current = await provider.getTransactionCount(signerAddress, "pending");
  nonceState.set(key, current + 1);
  return current;
}

async function withNonce(
  provider: ghost.JsonRpcProvider,
  rpcUrl: string,
  signerAddress: string,
  txOpts: ghost.TransactionRequest
): Promise<ghost.TransactionRequest> {
  return {
    ...txOpts,
    nonce: await nextNonce(provider, rpcUrl, signerAddress)
  };
}

async function main() {
  const CANONICAL_GAS_TOKEN = process.env.CANONICAL_GAS_TOKEN ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const root = process.env.ROOT_DIR ?? path.resolve(__dirname, "..", "..");
  const outPath = path.join(root, ".tmp", "last_rollups_manual.json");
  const gasLimit = BigInt(process.env.DEPLOY_GAS_LIMIT ?? "15000000");
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
  const enableCascadingFinality = parseBool(process.env.ENABLE_CASCADING_FINALITY, true);
  const enforceHierarchicalFinality = parseBool(process.env.ENFORCE_HIERARCHICAL_FINALITY, true);
  const autoAcceptPolicyHash = parseBool(process.env.AUTO_ACCEPT_POLICY_HASH, true);
  const aiPolicyHash = ensureBytes32(process.env.AI_POLICY_HASH, "AI_POLICY_HASH");
  const governanceExecutorOverride = normalizeAddress(process.env.GOVERNANCE_EXECUTOR);
  const governanceTimelock = normalizeAddress(process.env.GOVERNANCE_TIMELOCK) ?? ghost.ZeroAddress;
  const relayerKey = process.env.RELAYER_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY;
  if (!relayerKey) {
    throw new Error("Missing RELAYER_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) for rollup deployments");
  }
  const l2TokenAddr =
    process.env.L2_TOKEN_ADDRESS ??
    process.env.L2_TOKEN ??
    CANONICAL_GAS_TOKEN;
  const existingL1Rollup = normalizeAddress(process.env.L1_ROLLUP_L2_ADDRESS);
  const existingL2Rollup = normalizeAddress(process.env.L2_ROLLUP_L3_ADDRESS);
  const existingInbox = normalizeAddress(process.env.L3_INBOX_ADDRESS);
  const existingFactory = normalizeAddress(process.env.L3_TOKEN_FACTORY_ADDRESS);
  const existingL3Token = normalizeAddress(process.env.L3_TOKEN_ADDRESS);
  const bridgeAddress = normalizeAddress(process.env.L2L3_BRIDGE_ADDRESS ?? process.env.BRIDGE_L2L3_ADDRESS);
  let l1FinalityOracleAddr = normalizeAddress(process.env.L1_FINALITY_ORACLE_ADDRESS) ?? "";
  let l2FinalityOracleAddr = normalizeAddress(process.env.L2_FINALITY_ORACLE_ADDRESS) ?? "";
  let l3FinalityOracleAddr = normalizeAddress(process.env.L3_FINALITY_ORACLE_ADDRESS) ?? "";
  let l1RollupParentOracleAddr =
    normalizeAddress(
      process.env.L1_ROLLUP_PARENT_ORACLE ??
        process.env.ROLLUP_L2_PARENT_ORACLE_ADDRESS ??
        process.env.ROLLUP_L2_PARENT_ORACLE
    ) ?? "";
  let l2RollupParentOracleAddr =
    normalizeAddress(
      process.env.L2_ROLLUP_PARENT_ORACLE ??
        process.env.ROLLUP_L3_PARENT_ORACLE_ADDRESS ??
        process.env.ROLLUP_L3_PARENT_ORACLE
    ) ?? "";

  if (!l2TokenAddr) {
    throw new Error("Missing L2_TOKEN_ADDRESS env (ERC20 token address required).");
  }

  console.log("RPCs:", { l1Rpc, l2Rpc, l3Rpc });
  console.log("Config:", {
    gasLimit: gasLimit.toString(),
    maxFeePerGas: maxFeePerGas?.toString() ?? null,
    maxPriorityFeePerGas: maxPriorityFeePerGas?.toString() ?? null,
    l2ChainId,
    l3ChainId,
    challengePeriodSeconds,
    enableCascadingFinality,
    enforceHierarchicalFinality,
    aiPolicyHash: aiPolicyHash ?? null
  });

  const txOpts: ghost.TransactionRequest =
    maxFeePerGas !== undefined && maxPriorityFeePerGas !== undefined
      ? { gasLimit, maxFeePerGas, maxPriorityFeePerGas }
      : { gasLimit };

  const l1Provider = new ghost.JsonRpcProvider(l1Rpc);
  const l2Provider = new ghost.JsonRpcProvider(l2Rpc);
  const l3Provider = new ghost.JsonRpcProvider(l3Rpc);

  const l1Signer = new ghost.Wallet(relayerKey, l1Provider);
  const l2Signer = new ghost.Wallet(relayerKey, l2Provider);
  const l3Signer = new ghost.Wallet(relayerKey, l3Provider);
  const l1SignerAddress = await l1Signer.getAddress();
  const l2SignerAddress = await l2Signer.getAddress();
  const l3SignerAddress = await l3Signer.getAddress();

  const rollupArtifact = await loadArtifact("OptimisticRollup");
  const inboxArtifact = await loadArtifact("L3Inbox");
  const factoryArtifact = await loadArtifact("L3BridgedTokenFactory");
  const l1FinalityOracleArtifact = enableCascadingFinality ? await loadArtifact("L1FinalityOracle") : null;
  const l2FinalityOracleArtifact = enableCascadingFinality ? await loadArtifact("L2FinalityOracle") : null;
  const l3FinalityOracleArtifact = enableCascadingFinality ? await loadArtifact("L3FinalityOracle") : null;
  const bridgeArtifact =
    enableCascadingFinality && bridgeAddress ? await loadArtifact("L2L3Bridge") : null;

  const rollupFactoryL1 = new ghost.ContractFactory(
    rollupArtifact.abi,
    rollupArtifact.bytecode,
    l1Signer
  );
  const rollupFactoryL2 = new ghost.ContractFactory(
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
      l1SignerAddress,
      await withNonce(l1Provider, l1Rpc, l1SignerAddress, txOpts)
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
      l2SignerAddress,
      await withNonce(l2Provider, l2Rpc, l2SignerAddress, txOpts)
    );
    await l2Rollup.waitForDeployment();
    l2RollupAddr = await l2Rollup.getAddress();
    console.log("OptimisticRollup L3->L2 (L2):", l2RollupAddr);
  }

  if (enableCascadingFinality) {
    if (!l1FinalityOracleArtifact || !l2FinalityOracleArtifact || !l3FinalityOracleArtifact) {
      throw new Error("Missing finality oracle artifacts");
    }
    const governanceExecutor = governanceExecutorOverride ?? l2SignerAddress;
    console.log("== Deploy/Wire Cascading Finality Oracles on L2 ==");
    console.log("Cascading governance:", { executor: governanceExecutor, timelock: governanceTimelock });

    const l1FinalityOracleFactory = new ghost.ContractFactory(
      l1FinalityOracleArtifact.abi,
      l1FinalityOracleArtifact.bytecode,
      l2Signer
    );
    const l2FinalityOracleFactory = new ghost.ContractFactory(
      l2FinalityOracleArtifact.abi,
      l2FinalityOracleArtifact.bytecode,
      l2Signer
    );
    const l3FinalityOracleFactory = new ghost.ContractFactory(
      l3FinalityOracleArtifact.abi,
      l3FinalityOracleArtifact.bytecode,
      l2Signer
    );

    if (l1FinalityOracleAddr) {
      await assertCode(l2Provider, l1FinalityOracleAddr, "L1 finality oracle (on L2)");
    } else {
      const l1FinalityOracle = await l1FinalityOracleFactory.deploy(
        governanceExecutor,
        governanceTimelock,
        await withNonce(l2Provider, l2Rpc, l2SignerAddress, txOpts)
      );
      await l1FinalityOracle.waitForDeployment();
      l1FinalityOracleAddr = await l1FinalityOracle.getAddress();
      console.log("L1FinalityOracle (L2):", l1FinalityOracleAddr);
    }

    if (l2FinalityOracleAddr) {
      await assertCode(l2Provider, l2FinalityOracleAddr, "L2 finality oracle");
    } else {
      const l2FinalityOracle = await l2FinalityOracleFactory.deploy(
        governanceExecutor,
        governanceTimelock,
        l1FinalityOracleAddr,
        await withNonce(l2Provider, l2Rpc, l2SignerAddress, txOpts)
      );
      await l2FinalityOracle.waitForDeployment();
      l2FinalityOracleAddr = await l2FinalityOracle.getAddress();
      console.log("L2FinalityOracle (L2):", l2FinalityOracleAddr);
    }

    if (l3FinalityOracleAddr) {
      await assertCode(l2Provider, l3FinalityOracleAddr, "L3 finality oracle");
    } else {
      const l3FinalityOracle = await l3FinalityOracleFactory.deploy(
        governanceExecutor,
        governanceTimelock,
        l1FinalityOracleAddr,
        l2FinalityOracleAddr,
        await withNonce(l2Provider, l2Rpc, l2SignerAddress, txOpts)
      );
      await l3FinalityOracle.waitForDeployment();
      l3FinalityOracleAddr = await l3FinalityOracle.getAddress();
      console.log("L3FinalityOracle (L2):", l3FinalityOracleAddr);
    }

    if (!l1FinalityOracleAddr || !l2FinalityOracleAddr || !l3FinalityOracleAddr) {
      throw new Error("failed to resolve cascading finality oracle addresses");
    }

    if (aiPolicyHash && autoAcceptPolicyHash) {
      const l1FinalityOracle = new ghost.Contract(l1FinalityOracleAddr, l1FinalityOracleArtifact.abi, l2Signer) as ghost.Contract & {
        acceptedPolicyHash: (policyHash: string) => Promise<boolean>;
        setAcceptedPolicyHash: (
          policyHash: string,
          allowed: boolean,
          opts?: ghost.TransactionRequest
        ) => Promise<ghost.ContractTransactionResponse>;
      };
      const accepted = await l1FinalityOracle.acceptedPolicyHash(aiPolicyHash);
      if (!accepted) {
        const tx = await l1FinalityOracle.setAcceptedPolicyHash(
          aiPolicyHash,
          true,
          await withNonce(l2Provider, l2Rpc, l2SignerAddress, txOpts)
        );
        await tx.wait();
        console.log("Accepted AI policy hash on L1FinalityOracle:", aiPolicyHash);
      }
    }

    if (bridgeAddress) {
      if (!bridgeArtifact) {
        throw new Error("Missing L2L3Bridge artifact");
      }
      await assertCode(l2Provider, bridgeAddress, "L2L3Bridge");
      const bridge = new ghost.Contract(bridgeAddress, bridgeArtifact.abi, l2Signer) as ghost.Contract & {
        l2FinalityOracle: () => Promise<string>;
        l3FinalityOracle: () => Promise<string>;
        enforceHierarchicalFinality: () => Promise<boolean>;
        setL2FinalityOracle: (
          oracle: string,
          opts?: ghost.TransactionRequest
        ) => Promise<ghost.ContractTransactionResponse>;
        setL3FinalityOracle: (
          oracle: string,
          opts?: ghost.TransactionRequest
        ) => Promise<ghost.ContractTransactionResponse>;
        setEnforceHierarchicalFinality: (
          enabled: boolean,
          opts?: ghost.TransactionRequest
        ) => Promise<ghost.ContractTransactionResponse>;
      };

      const currentL2Oracle = ghost.getAddress(await bridge.l2FinalityOracle());
      if (currentL2Oracle !== l2FinalityOracleAddr) {
        const tx = await bridge.setL2FinalityOracle(
          l2FinalityOracleAddr,
          await withNonce(l2Provider, l2Rpc, l2SignerAddress, txOpts)
        );
        await tx.wait();
      }

      const currentL3Oracle = ghost.getAddress(await bridge.l3FinalityOracle());
      if (currentL3Oracle !== l3FinalityOracleAddr) {
        const tx = await bridge.setL3FinalityOracle(
          l3FinalityOracleAddr,
          await withNonce(l2Provider, l2Rpc, l2SignerAddress, txOpts)
        );
        await tx.wait();
      }

      const currentEnforcement = Boolean(await bridge.enforceHierarchicalFinality());
      if (currentEnforcement !== enforceHierarchicalFinality) {
        const tx = await bridge.setEnforceHierarchicalFinality(
          enforceHierarchicalFinality,
          await withNonce(l2Provider, l2Rpc, l2SignerAddress, txOpts)
        );
        await tx.wait();
      }
    }

    const l2Rollup = new ghost.Contract(l2RollupAddr, rollupArtifact.abi, l2Signer) as ghost.Contract & {
      parentFinalityOracle: () => Promise<string>;
      setParentFinalityOracle: (
        oracle: string,
        opts?: ghost.TransactionRequest
      ) => Promise<ghost.ContractTransactionResponse>;
    };

    l2RollupParentOracleAddr = l2RollupParentOracleAddr || l3FinalityOracleAddr;
    await assertCode(l2Provider, l2RollupParentOracleAddr, "L2 rollup parent finality oracle");
    const currentL2RollupParent = ghost.getAddress(await l2Rollup.parentFinalityOracle());
    if (currentL2RollupParent !== l2RollupParentOracleAddr) {
      const tx = await l2Rollup.setParentFinalityOracle(
        l2RollupParentOracleAddr,
        await withNonce(l2Provider, l2Rpc, l2SignerAddress, txOpts)
      );
      await tx.wait();
    }

    l1RollupParentOracleAddr = l1RollupParentOracleAddr || l2FinalityOracleAddr;
    const l1Rollup = new ghost.Contract(l1RollupAddr, rollupArtifact.abi, l1Signer) as ghost.Contract & {
      parentFinalityOracle: () => Promise<string>;
      setParentFinalityOracle: (
        oracle: string,
        opts?: ghost.TransactionRequest
      ) => Promise<ghost.ContractTransactionResponse>;
    };
    const l1ParentCode = await l1Provider.getCode(l1RollupParentOracleAddr);
    if (!l1ParentCode || l1ParentCode === "0x") {
      if (
        normalizeAddress(
          process.env.L1_ROLLUP_PARENT_ORACLE ??
            process.env.ROLLUP_L2_PARENT_ORACLE_ADDRESS ??
            process.env.ROLLUP_L2_PARENT_ORACLE
        )
      ) {
        throw new Error(`No bytecode at configured L1 rollup parent oracle on L1: ${l1RollupParentOracleAddr}`);
      }
      console.warn(
        "Skipping L1 rollup parent oracle wiring: no oracle bytecode on L1 at",
        l1RollupParentOracleAddr,
        "(set L1_ROLLUP_PARENT_ORACLE for L1-local oracle)"
      );
      l1RollupParentOracleAddr = "";
    } else {
      const currentL1RollupParent = ghost.getAddress(await l1Rollup.parentFinalityOracle());
      if (currentL1RollupParent !== l1RollupParentOracleAddr) {
        const tx = await l1Rollup.setParentFinalityOracle(
          l1RollupParentOracleAddr,
          await withNonce(l1Provider, l1Rpc, l1SignerAddress, txOpts)
        );
        await tx.wait();
      }
    }
  }

  let inboxAddr = existingInbox;
  if (inboxAddr) {
    await assertCode(l3Provider, inboxAddr, "L3 inbox");
  } else {
    console.log("== Deploy L3Inbox on L3 ==");
    const inboxFactory = new ghost.ContractFactory(inboxArtifact.abi, inboxArtifact.bytecode, l3Signer);
    const inbox = await inboxFactory.deploy(
      l3SignerAddress,
      await withNonce(l3Provider, l3Rpc, l3SignerAddress, txOpts)
    );
    await inbox.waitForDeployment();
    inboxAddr = await inbox.getAddress();
    console.log("L3Inbox (L3):", inboxAddr);
  }

  let factoryAddr = existingFactory;
  if (factoryAddr) {
    await assertCode(l3Provider, factoryAddr, "L3 token factory");
  } else {
    console.log("== Deploy L3BridgedTokenFactory on L3 ==");
    const factoryFactory = new ghost.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, l3Signer);
    const factory = await factoryFactory.deploy(
      l3SignerAddress,
      await withNonce(l3Provider, l3Rpc, l3SignerAddress, txOpts)
    );
    await factory.waitForDeployment();
    factoryAddr = await factory.getAddress();
    console.log("L3BridgedTokenFactory (L3):", factoryAddr);
  }

  let l3TokenAddr = existingL3Token;
  if (!l3TokenAddr) {
    const l2TokenCode = await l2Provider.getCode(l2TokenAddr);
    if (!l2TokenCode || l2TokenCode === "0x") {
      console.warn(`No ERC20 bytecode at L2_TOKEN_ADDRESS=${l2TokenAddr}; skipping L3 bridged token deploy.`);
    } else {
      try {
        console.log("== Deploy default L3 bridged token for L2 ERC20 ==");
        const erc20Abi = [
          "function name() view returns (string)",
          "function symbol() view returns (string)",
          "function decimals() view returns (uint8)"
        ];
        const l2Token = new ghost.Contract(l2TokenAddr, erc20Abi, l2Provider);
        const l2Name = await l2Token.name();
        const l2Symbol = await l2Token.symbol();
        const l2Decimals = await l2Token.decimals();
        const l3Name = `${l2Name} (L3)`;
        const l3Symbol = `${l2Symbol}L3`;
        const factory = new ghost.Contract(factoryAddr!, factoryArtifact.abi, l3Signer) as ghost.Contract & {
          getOrDeployBridgedToken: (
            l2Token: string,
            name: string,
            symbol: string,
            decimals: number,
            opts?: ghost.TransactionRequest
          ) => Promise<ghost.ContractTransactionResponse>;
        };
        const deployTokenTx = await factory.getOrDeployBridgedToken(
          l2TokenAddr,
          l3Name,
          l3Symbol,
          l2Decimals,
          await withNonce(l3Provider, l3Rpc, l3SignerAddress, txOpts)
        );
        const deployTokenRcpt = await deployTokenTx.wait();
        const deployed = deployTokenRcpt?.logs
          .map((log) => {
            try {
              return factory.interface.parseLog(log as ghost.Log);
            } catch {
              return null;
            }
          })
          .find((entry) => entry?.name === "BridgedTokenDeployed");
        l3TokenAddr = String(deployed?.args?.l3Token ?? "");
        console.log("L3BridgedToken (L3, default):", l3TokenAddr);
      } catch (err) {
        console.warn("Skipping default L3 bridged token: unable to query L2 token metadata.", err);
      }
    }
  } else {
    await assertCode(l3Provider, l3TokenAddr, "L3 bridged token");
  }

  const summary = {
    l1RollupAddr,
    l2RollupAddr,
    inboxAddr,
    factoryAddr,
    l3TokenAddr: l3TokenAddr ?? null,
    cascadingFinality: enableCascadingFinality
      ? {
          enforceHierarchicalFinality,
          aiPolicyHash: aiPolicyHash ?? null,
          bridgeAddress: bridgeAddress ?? null,
          l1FinalityOracleAddr: l1FinalityOracleAddr || null,
          l2FinalityOracleAddr: l2FinalityOracleAddr || null,
          l3FinalityOracleAddr: l3FinalityOracleAddr || null,
          l1RollupParentOracleAddr: l1RollupParentOracleAddr || null,
          l2RollupParentOracleAddr: l2RollupParentOracleAddr || null
        }
      : null
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.log("Wrote:", outPath);
  console.log("Summary:");
  console.log(summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
