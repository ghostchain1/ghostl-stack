import { ghost, network, artifacts } from "hardhat";
import path from "node:path";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

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

async function waitForReceipt(
  provider: ghost.Provider,
  hash: string,
  label: string,
  retries = 0,
  timeoutMs = 120_000
): Promise<ghost.TransactionReceipt | null> {
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
  contract:ghost.Contract,
  provider: ghost.JsonRpcProvider,
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
  // Default to OP Stack devnet ports (Anvil L1 :28545, op-geth L2 :29547). L3 is optional; keep overrideable.
  const l2ChainId = Number(process.env.L2_CHAIN_ID ?? process.env.OP_L2_CHAIN_ID ?? network.config.chainId ?? 901);
  const l3ChainId = Number(process.env.L3_CHAIN_ID ?? process.env.OP_L3_CHAIN_ID ?? 903);
  const challengePeriodSeconds = Number(process.env.CHALLENGE_PERIOD_SECONDS ?? 30);
  const enableCascadingFinality = parseBool(process.env.ENABLE_CASCADING_FINALITY, true);
  const enforceHierarchicalFinality = parseBool(process.env.ENFORCE_HIERARCHICAL_FINALITY, true);
  const autoAcceptPolicyHash = parseBool(process.env.AUTO_ACCEPT_POLICY_HASH, true);
  const aiPolicyHash = ensureBytes32(process.env.AI_POLICY_HASH, "AI_POLICY_HASH");
  const governanceExecutorOverride = normalizeAddress(process.env.GOVERNANCE_EXECUTOR);
  const governanceTimelock = normalizeAddress(process.env.GOVERNANCE_TIMELOCK) ?? ghost.ZeroAddress;
  const l1RollupParentOracleEnv = normalizeAddress(
    process.env.L1_ROLLUP_PARENT_ORACLE ??
      process.env.ROLLUP_L2_PARENT_ORACLE_ADDRESS ??
      process.env.ROLLUP_L2_PARENT_ORACLE
  );
  const l2RollupParentOracleEnv = normalizeAddress(
    process.env.L2_ROLLUP_PARENT_ORACLE ??
      process.env.ROLLUP_L3_PARENT_ORACLE_ADDRESS ??
      process.env.ROLLUP_L3_PARENT_ORACLE
  );
  let l1FinalityOracleAddr = normalizeAddress(process.env.L1_FINALITY_ORACLE_ADDRESS) ?? "";
  let l2FinalityOracleAddr = normalizeAddress(process.env.L2_FINALITY_ORACLE_ADDRESS) ?? "";
  let l3FinalityOracleAddr = normalizeAddress(process.env.L3_FINALITY_ORACLE_ADDRESS) ?? "";
  let l1RollupParentOracleAddr = l1RollupParentOracleEnv ?? "";
  let l2RollupParentOracleAddr = l2RollupParentOracleEnv ?? "";
  const rpcL1 = process.env.RPC_L1 ?? "http://localhost:28545";
  const rpcL2Public =
    process.env.RPC_L2 ??
    (typeof (network.config as any)?.url === "string" ? String((network.config as any).url) : "http://localhost:29547");
  const rpcL3Public = process.env.RPC_L3 ?? "http://localhost:39545";

  console.log(
    `Config -> L2 chainId=${l2ChainId}, L3 chainId=${l3ChainId}, challengePeriodSeconds=${challengePeriodSeconds}`
  );
  console.log(
    `Cascading finality -> enabled=${enableCascadingFinality} enforce=${enforceHierarchicalFinality} aiPolicyHash=${aiPolicyHash ?? "none"}`
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
  const l2 = await ghost.getSigners();
  if (!l2.length) {
    throw new Error(
      `No signers available for network=${network.name}. Set DEPLOYER_PRIVATE_KEY (or configure hardhat network accounts).`
    );
  }
  if (!l2[0].provider) {
    throw new Error(`Signer has no provider for network=${network.name}. Check your Hardhat RPC URL config.`);
  }
  const l2Provider = l2[0].provider as ghost.JsonRpcProvider;
  const l2TokenCode = await l2Provider.getCode(l2TokenAddr);
  const l2TokenHasCode = !!l2TokenCode && l2TokenCode !== "0x";

  console.log(`Deploying to GhostL2 network (${network.name})...`);
  console.log("== Deploy GuardPolicy on L2 ==");
  const Policy = await ghost.getContractFactory("GuardPolicy");
  const policy = await Policy.connect(l2[0]).deploy(txOpts);
  await waitForDeployment(policy, l2[0].provider as ghost.JsonRpcProvider, "GuardPolicy");

  console.log("== Deploy L2L3Bridge on L2 ==");
  const Bridge = await ghost.getContractFactory("L2L3Bridge");
  const bridge = await Bridge.connect(l2[0]).deploy(await policy.getAddress(), txOpts);
  await waitForDeployment(bridge, l2[0].provider as ghost.JsonRpcProvider, "L2L3Bridge");

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
  const GhostNFT = await ghost.getContractFactory("GhostNFT");
  const l2NftName = process.env.L2_NFT_NAME ?? "GhostL2 NFT";
  const l2NftSymbol = process.env.L2_NFT_SYMBOL ?? "GL2NFT";
  const l2Nft = await GhostNFT.connect(l2[0]).deploy(l2NftName, l2NftSymbol, txOpts);
  await waitForDeployment(l2Nft, l2[0].provider as ghost.JsonRpcProvider, "GhostNFT L2");
  const l2NftAddr = await l2Nft.getAddress();
  await recordDeployment("l2", "GhostNFT", l2NftAddr, l2ChainId);
  console.log("GhostNFT (L2):", l2NftAddr);

  // Deploy inbox on L3 (GhostL3) using the same dev key by default.
  const l3Rpc = rpcL3Public;
  const relayerKey = process.env.RELAYER_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY;
  if (!relayerKey) {
    throw new Error("Missing RELAYER_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) for L1/L3 deployments");
  }

  const l3Provider = new ghost.JsonRpcProvider(l3Rpc);
  const l3Signer = new ghost.Wallet(relayerKey, l3Provider);
  const relayerAddr = await l3Signer.getAddress();
  let l3Nonce = await l3Provider.getTransactionCount(relayerAddr, "pending");
  const nextL3Nonce = () => l3Nonce++;

  console.log("== Set bridge relayer on L2 ==");
  const setRelayerTx = await bridge.setRelayer(relayerAddr, txOpts);
  await waitForReceipt(l2[0].provider as ghost.JsonRpcProvider, setRelayerTx.hash, "Bridge.setRelayer");
  console.log("Bridge relayer (L2):", relayerAddr);

  // The bridge defaults to strict compliance gating. For local devnets, disable this by default so E2E flows work
  // out-of-the-box. Production/staging should set BRIDGE_REQUIRE_COMPLIANCE_ROOT=true and configure a real guard.
  const requireComplianceRoot = (process.env.BRIDGE_REQUIRE_COMPLIANCE_ROOT ?? "false") === "true";
  if (!requireComplianceRoot) {
    console.log("== Disable L2L3Bridge compliance root requirement (dev default) ==");
    const tx = await bridge.setRequireComplianceRoot(false, txOpts);
    await waitForReceipt(l2[0].provider as ghost.JsonRpcProvider, tx.hash, "Bridge.setRequireComplianceRoot(false)");
  }

  // Deploy optimistic settlement contracts:
  // - L2 batches posted to L1 (Anvil)
  // - L3 batches posted to L2 (GhostL2)
  const l1Provider = new ghost.JsonRpcProvider(rpcL1);
  const l1Signer = new ghost.Wallet(relayerKey, l1Provider);
  const l1Address = await l1Signer.getAddress();
  let l1Nonce = await l1Provider.getTransactionCount(l1Address, "pending");
  const nextL1Nonce = () => l1Nonce++;

  const Rollup = await ghost.getContractFactory("OptimisticRollup");

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
  const constitutionZkVerifier = process.env.CONSTITUTION_ZK_VERIFIER ?? ghost.ZeroAddress;
  const Constitution = await ghost.getContractFactory("GhostConstitution");
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
  await waitForDeployment(l2Rollup, l2[0].provider as ghost.JsonRpcProvider, "OptimisticRollup L3->L2");
  const l2RollupAddr = await l2Rollup.getAddress();
  await recordDeployment("l2", "OptimisticRollup", l2RollupAddr, l2ChainId);
  console.log("OptimisticRollup L3->L2 (L2):", l2RollupAddr);

  if (enableCascadingFinality) {
    const governanceExecutor = governanceExecutorOverride ?? (await l2[0].getAddress());
    console.log("== Deploy/Wire Cascading Finality Oracles on L2 ==");
    console.log("Cascading governance:", { executor: governanceExecutor, timelock: governanceTimelock });

    const L1FinalityOracle = await ghost.getContractFactory("L1FinalityOracle");
    const L2FinalityOracle = await ghost.getContractFactory("L2FinalityOracle");
    const L3FinalityOracle = await ghost.getContractFactory("L3FinalityOracle");

    if (l1FinalityOracleAddr) {
      const code = await l2Provider.getCode(l1FinalityOracleAddr);
      if (!code || code === "0x") {
        throw new Error(`No bytecode at L1_FINALITY_ORACLE_ADDRESS on L2 network: ${l1FinalityOracleAddr}`);
      }
    } else {
      const l1FinalityOracle = await L1FinalityOracle.connect(l2[0]).deploy(governanceExecutor, governanceTimelock, txOpts);
      await waitForDeployment(l1FinalityOracle, l2Provider, "L1FinalityOracle");
      l1FinalityOracleAddr = await l1FinalityOracle.getAddress();
      console.log("L1FinalityOracle (L2):", l1FinalityOracleAddr);
    }

    if (l2FinalityOracleAddr) {
      const code = await l2Provider.getCode(l2FinalityOracleAddr);
      if (!code || code === "0x") {
        throw new Error(`No bytecode at L2_FINALITY_ORACLE_ADDRESS on L2 network: ${l2FinalityOracleAddr}`);
      }
    } else {
      const l2FinalityOracle = await L2FinalityOracle.connect(l2[0]).deploy(
        governanceExecutor,
        governanceTimelock,
        l1FinalityOracleAddr,
        txOpts
      );
      await waitForDeployment(l2FinalityOracle, l2Provider, "L2FinalityOracle");
      l2FinalityOracleAddr = await l2FinalityOracle.getAddress();
      console.log("L2FinalityOracle (L2):", l2FinalityOracleAddr);
    }

    if (l3FinalityOracleAddr) {
      const code = await l2Provider.getCode(l3FinalityOracleAddr);
      if (!code || code === "0x") {
        throw new Error(`No bytecode at L3_FINALITY_ORACLE_ADDRESS on L2 network: ${l3FinalityOracleAddr}`);
      }
    } else {
      const l3FinalityOracle = await L3FinalityOracle.connect(l2[0]).deploy(
        governanceExecutor,
        governanceTimelock,
        l1FinalityOracleAddr,
        l2FinalityOracleAddr,
        txOpts
      );
      await waitForDeployment(l3FinalityOracle, l2Provider, "L3FinalityOracle");
      l3FinalityOracleAddr = await l3FinalityOracle.getAddress();
      console.log("L3FinalityOracle (L2):", l3FinalityOracleAddr);
    }

    await recordDeployment("l2", "L1FinalityOracle", l1FinalityOracleAddr, l2ChainId);
    await recordDeployment("l2", "L2FinalityOracle", l2FinalityOracleAddr, l2ChainId);
    await recordDeployment("l2", "L3FinalityOracle", l3FinalityOracleAddr, l2ChainId);

    if (aiPolicyHash && autoAcceptPolicyHash) {
      const l1FinalityOracle = await ghost.getContractAt("L1FinalityOracle", l1FinalityOracleAddr, l2[0]);
      const accepted = await (l1FinalityOracle as any).acceptedPolicyHash(aiPolicyHash);
      if (!accepted) {
        const tx = await (l1FinalityOracle as any).setAcceptedPolicyHash(aiPolicyHash, true, txOpts);
        await waitForReceipt(l2Provider, tx.hash, "L1FinalityOracle.setAcceptedPolicyHash");
        console.log("Accepted AI policy hash on L1FinalityOracle:", aiPolicyHash);
      }
    }

    const currentBridgeL2Oracle = ghost.getAddress(await bridge.l2FinalityOracle());
    if (currentBridgeL2Oracle !== l2FinalityOracleAddr) {
      const tx = await bridge.setL2FinalityOracle(l2FinalityOracleAddr, txOpts);
      await waitForReceipt(l2Provider, tx.hash, "L2L3Bridge.setL2FinalityOracle");
    }

    const currentBridgeL3Oracle = ghost.getAddress(await bridge.l3FinalityOracle());
    if (currentBridgeL3Oracle !== l3FinalityOracleAddr) {
      const tx = await bridge.setL3FinalityOracle(l3FinalityOracleAddr, txOpts);
      await waitForReceipt(l2Provider, tx.hash, "L2L3Bridge.setL3FinalityOracle");
    }

    const currentBridgeEnforcement = Boolean(await bridge.enforceHierarchicalFinality());
    if (currentBridgeEnforcement !== enforceHierarchicalFinality) {
      const tx = await bridge.setEnforceHierarchicalFinality(enforceHierarchicalFinality, txOpts);
      await waitForReceipt(l2Provider, tx.hash, "L2L3Bridge.setEnforceHierarchicalFinality");
    }

    l2RollupParentOracleAddr = l2RollupParentOracleAddr || l3FinalityOracleAddr;
    const l2ParentCode = await l2Provider.getCode(l2RollupParentOracleAddr);
    if (!l2ParentCode || l2ParentCode === "0x") {
      throw new Error(`No bytecode at L2 rollup parent finality oracle on L2 network: ${l2RollupParentOracleAddr}`);
    }
    const currentL2ParentOracle = ghost.getAddress(await l2Rollup.parentFinalityOracle());
    if (currentL2ParentOracle !== l2RollupParentOracleAddr) {
      const tx = await l2Rollup.setParentFinalityOracle(l2RollupParentOracleAddr, txOpts);
      await waitForReceipt(l2Provider, tx.hash, "OptimisticRollup(L3->L2).setParentFinalityOracle");
    }

    l1RollupParentOracleAddr = l1RollupParentOracleAddr || l2FinalityOracleAddr;
    const l1ParentCode = await l1Provider.getCode(l1RollupParentOracleAddr);
    if (!l1ParentCode || l1ParentCode === "0x") {
      if (l1RollupParentOracleEnv) {
        throw new Error(`No bytecode at configured L1 rollup parent finality oracle on L1: ${l1RollupParentOracleAddr}`);
      }
      console.warn(
        "Skipping L1 rollup parent oracle wiring: no oracle bytecode on L1 at",
        l1RollupParentOracleAddr,
        "(set L1_ROLLUP_PARENT_ORACLE for L1-local oracle)"
      );
      l1RollupParentOracleAddr = "";
    } else {
      const currentL1ParentOracle = ghost.getAddress(await l1Rollup.parentFinalityOracle());
      if (currentL1ParentOracle !== l1RollupParentOracleAddr) {
        // If L1/L2 share RPC+key in dev, refresh nonce to avoid drift from L2 transactions.
        l1Nonce = await l1Provider.getTransactionCount(l1Address, "pending");
        const tx = await l1Rollup.setParentFinalityOracle(l1RollupParentOracleAddr, {
          ...txOpts,
          nonce: nextL1Nonce()
        });
        await waitForReceipt(l1Provider, tx.hash, "OptimisticRollup(L2->L1).setParentFinalityOracle");
      }
    }

    console.log("Cascading finality wiring complete:", {
      l1FinalityOracleAddr,
      l2FinalityOracleAddr,
      l3FinalityOracleAddr,
      l1RollupParentOracleAddr: l1RollupParentOracleAddr || null,
      l2RollupParentOracleAddr
    });
  }

  console.log("== Deploy L3Inbox on L3 ==");
  // If L2/L3 share RPC+key in dev, refresh nonce to avoid drift from L2 transactions.
  l3Nonce = await l3Provider.getTransactionCount(relayerAddr, "pending");
  const Inbox = await ghost.getContractFactory("L3Inbox");
  const inbox = await Inbox.connect(l3Signer).deploy(relayerAddr, { ...l3TxOpts, nonce: nextL3Nonce() });
  await waitForDeployment(inbox, l3Provider, "L3Inbox");
  const inboxAddr = await inbox.getAddress();
  await recordDeployment("l3", "L3Inbox", inboxAddr, l3ChainId);
  console.log("L3Inbox (L3):", inboxAddr);

  console.log("== Deploy L3BridgedTokenFactory on L3 ==");
  const Factory = await ghost.getContractFactory("L3BridgedTokenFactory");
  const factory = await Factory.connect(l3Signer).deploy(relayerAddr, { ...l3TxOpts, nonce: nextL3Nonce() });
  await waitForDeployment(factory, l3Provider, "L3BridgedTokenFactory");
  const factoryAddr = await factory.getAddress();
  await recordDeployment("l3", "L3BridgedTokenFactory", factoryAddr, l3ChainId);
  console.log("L3BridgedTokenFactory (L3):", factoryAddr);

  console.log("== Deploy GhostNFT on L3 ==");
  const l3NftName = process.env.L3_NFT_NAME ?? "GhostL3 NFT";
  const l3NftSymbol = process.env.L3_NFT_SYMBOL ?? "GL3NFT";
  const l3Nft = await GhostNFT.connect(l3Signer).deploy(l3NftName, l3NftSymbol, {
    ...l3TxOpts,
    nonce: nextL3Nonce()
  });
  await waitForDeployment(l3Nft, l3Provider, "GhostNFT L3");
  const l3NftAddr = await l3Nft.getAddress();
  await recordDeployment("l3", "GhostNFT", l3NftAddr, l3ChainId);
  console.log("GhostNFT (L3):", l3NftAddr);

  // Deploy a default bridged token when the L2 token has ERC20 bytecode.
  let l3TokenAddr = "";
  if (l2TokenHasCode) {
    try {
      const l2Token = await ghost.getContractAt("src/common/ERC20.sol:ERC20", l2TokenAddr, l2[0]);
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
        { ...l3TxOpts, nonce: nextL3Nonce() }
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
    `ENABLE_CASCADING_FINALITY=${enableCascadingFinality ? 1 : 0}`,
    `ENFORCE_HIERARCHICAL_FINALITY=${enforceHierarchicalFinality ? 1 : 0}`,
    `L1_FINALITY_ORACLE_ADDRESS=${l1FinalityOracleAddr}`,
    `L2_FINALITY_ORACLE_ADDRESS=${l2FinalityOracleAddr}`,
    `L3_FINALITY_ORACLE_ADDRESS=${l3FinalityOracleAddr}`,
    `AI_POLICY_HASH=${aiPolicyHash ?? ""}`,
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
    `ENABLE_CASCADING_FINALITY=${enableCascadingFinality ? 1 : 0}`,
    `L1_FINALITY_ORACLE_ADDRESS=${l1FinalityOracleAddr}`,
    `L2_FINALITY_ORACLE_ADDRESS=${l2FinalityOracleAddr}`,
    `L3_FINALITY_ORACLE_ADDRESS=${l3FinalityOracleAddr}`,
    `AI_POLICY_HASH=${aiPolicyHash ?? ""}`,
    `L1_ROLLUP_L2_ADDRESS=${l1RollupAddr}`,
    `L1_ROLLUP_PARENT_ORACLE=${l1RollupParentOracleAddr}`,
    `L2_ROLLUP_L3_ADDRESS=${l2RollupAddr}`,
    `L2_ROLLUP_PARENT_ORACLE=${l2RollupParentOracleAddr}`,
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
    // Write via a temp file + rename so we can replace root-owned files as long as the directory is writable.
    // (Deleting/replacing files is governed by directory perms; opening an existing root-owned file for write is not.)
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify({ network: network.name, layer, contracts: deployments[layer] }, null, 2));
    await fs.rename(tmpPath, filePath);
    console.log("Wrote:", filePath);
  };
  await writeLayer("l1");
  await writeLayer("l2");
  await writeLayer("l3");

  const rollupConfig = {
    l1: { rollup: l1RollupAddr, chainId: Number(l1Network.chainId), parentFinalityOracle: l1RollupParentOracleAddr || null },
    l2: { rollup: l2RollupAddr, chainId: l2ChainId, parentFinalityOracle: l2RollupParentOracleAddr || null },
    l3: { inbox: inboxAddr, factory: factoryAddr, chainId: l3ChainId },
    cascadingFinality: {
      enabled: enableCascadingFinality,
      enforceHierarchicalFinality,
      aiPolicyHash: aiPolicyHash ?? null,
      l1FinalityOracle: l1FinalityOracleAddr || null,
      l2FinalityOracle: l2FinalityOracleAddr || null,
      l3FinalityOracle: l3FinalityOracleAddr || null
    }
  };
  {
    const filePath = path.join(outputDir, "rollup-config.json");
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(rollupConfig, null, 2));
    await fs.rename(tmpPath, filePath);
  }
  if (enableCascadingFinality) {
    const cascadingFinalityConfig = {
      network: network.name,
      chainIdL1: Number(l1Network.chainId),
      chainIdL2: l2ChainId,
      chainIdL3: l3ChainId,
      enforceHierarchicalFinality,
      aiPolicyHash: aiPolicyHash ?? null,
      oracles: {
        l1: l1FinalityOracleAddr || null,
        l2: l2FinalityOracleAddr || null,
        l3: l3FinalityOracleAddr || null
      },
      rollups: {
        l2OnL1: l1RollupAddr,
        l2OnL1ParentOracle: l1RollupParentOracleAddr || null,
        l3OnL2: l2RollupAddr,
        l3OnL2ParentOracle: l2RollupParentOracleAddr || null
      },
      bridge: {
        l2L3Bridge: bridgeAddr,
        l2FinalityOracle: l2FinalityOracleAddr || null,
        l3FinalityOracle: l3FinalityOracleAddr || null
      }
    };
    const filePath = path.join(outputDir, "cascading-finality.json");
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(cascadingFinalityConfig, null, 2));
    await fs.rename(tmpPath, filePath);
    console.log("Wrote:", filePath);
  }
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
