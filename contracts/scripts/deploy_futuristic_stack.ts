import { ethers } from "hardhat";

type Deployable = { deploymentTransaction: () => any; getAddress: () => Promise<string> };

async function deploy<T extends Deployable>(name: string, args: any[] = []): Promise<T> {
  const Factory = await ethers.getContractFactory(name);
  const contract = (await Factory.deploy(...args)) as unknown as T;
  const tx = contract.deploymentTransaction();
  if (tx?.hash) {
    await tx.wait();
  }
  const addr = await contract.getAddress();
  console.log(`${name}: ${addr}`);
  return contract;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const exportEnv = process.env.EXPORT_ENV === "1";
  const deployLayerRaw = process.env.DEPLOY_LAYER;
  const deployLayer = deployLayerRaw ? deployLayerRaw.toUpperCase() : "";
  const envPrefix = process.env.DEPLOY_ENV_PREFIX ?? "FUT";
  const envSuffix = deployLayer ? `_${deployLayer}` : "";
  const envKey = (name: string) => `${envPrefix}${envSuffix}_${name}`;
  const emitEnv = (name: string, value: string) => {
    if (!exportEnv) return;
    console.log(`${envKey(name)}=${value}`);
  };

  const governanceOnly = process.env.GOVERNANCE_ONLY === "1";
  if (governanceOnly) {
    const tokenAddress =
      process.env.GOVERNANCE_TOKEN_ADDRESS ?? process.env.GOVERNANCE_TOKEN ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const delaySeconds = Number(process.env.GOVERNANCE_DELAY_SECONDS ?? 600);
    const constitutionHashRaw = process.env.CONSTITUTION_HASH ?? process.env.AI_CONSTITUTION_HASH ?? "";
    if (!constitutionHashRaw || !ethers.isHexString(constitutionHashRaw, 32)) {
      throw new Error("CONSTITUTION_HASH (32-byte hex) is required for governance-only deployments.");
    }
    const constitutionHash = constitutionHashRaw;
    const provider = deployer.provider;
    if (!provider) {
      throw new Error("Missing provider for governance-only deployment");
    }
    const tokenCode = await provider.getCode(tokenAddress);
    if (!tokenCode || tokenCode === "0x") {
      throw new Error(`No ERC20 bytecode found at GOVERNANCE_TOKEN_ADDRESS=${tokenAddress}`);
    }

    console.log(`[governance-only] token=${tokenAddress} delay=${delaySeconds}s`);
    const executor = await deploy<Deployable>("ProposalExecutor", [delaySeconds]);
    const executorAddress = await executor.getAddress();
    emitEnv("PROPOSAL_EXECUTOR", executorAddress);

    const evidenceAnchor = await deploy<Deployable>("EvidenceAnchor", [ethers.ZeroAddress, ethers.ZeroAddress]);
    const evidenceBundle = await deploy<Deployable>("EvidenceBundle", [
      executorAddress,
      ethers.ZeroAddress,
      await evidenceAnchor.getAddress()
    ]);
    if ((evidenceAnchor as any).setGovernance) {
      await (await (evidenceAnchor as any).setGovernance(await evidenceBundle.getAddress(), ethers.ZeroAddress)).wait();
    }
    const constitution = await deploy<Deployable>("GhostConstitution", [deployer.address, ethers.ZeroAddress, ethers.ZeroAddress]);
    const constitutionalGuard = await deploy<Deployable>("ConstitutionalGuard", [
      executorAddress,
      ethers.ZeroAddress,
      await constitution.getAddress()
    ]);

    await (await (executor as any).setEvidenceBundle(await evidenceBundle.getAddress())).wait();
    await (await (executor as any).setConstitutionalGuard(await constitutionalGuard.getAddress())).wait();

    const evidenceVault = await deploy<Deployable>("EvidenceVault", [deployer.address, ethers.ZeroAddress, constitutionHash]);
    const policyRegistry = await deploy<Deployable>("PolicyRegistry", [deployer.address, ethers.ZeroAddress, constitutionHash]);
    const aiProposalExecutor = await deploy<Deployable>("AIProposalExecutor", [
      deployer.address,
      ethers.ZeroAddress,
      constitutionHash
    ]);
    await (await (aiProposalExecutor as any).setPolicyRegistry(await policyRegistry.getAddress())).wait();
    await (await (aiProposalExecutor as any).setEvidenceVault(await evidenceVault.getAddress())).wait();
    await (await (aiProposalExecutor as any).setConstitutionalGuard(await constitutionalGuard.getAddress())).wait();
    await (await (evidenceVault as any).setSubmitter(await aiProposalExecutor.getAddress(), true)).wait();
    await (await (policyRegistry as any).setGovernance(await aiProposalExecutor.getAddress(), ethers.ZeroAddress)).wait();
    await (await (aiProposalExecutor as any).setGovernance(executorAddress, ethers.ZeroAddress)).wait();
    await (await (evidenceVault as any).setGovernance(executorAddress, ethers.ZeroAddress)).wait();

    emitEnv("EVIDENCE_ANCHOR", await evidenceAnchor.getAddress());
    emitEnv("EVIDENCE_BUNDLE", await evidenceBundle.getAddress());
    emitEnv("CONSTITUTION", await constitution.getAddress());
    emitEnv("CONSTITUTIONAL_GUARD", await constitutionalGuard.getAddress());
    emitEnv("CONSTITUTION_HASH", constitutionHash);
    emitEnv("EVIDENCE_VAULT", await evidenceVault.getAddress());
    emitEnv("POLICY_REGISTRY", await policyRegistry.getAddress());
    emitEnv("AI_PROPOSAL_EXECUTOR", await aiProposalExecutor.getAddress());

    const governor = await deploy<Deployable>("Governor", [tokenAddress, executorAddress]);
    const upgradeManager = await deploy<any>("UpgradeManager");
    if (upgradeManager?.setEvidenceBundle) {
      await (await upgradeManager.setEvidenceBundle(await evidenceBundle.getAddress())).wait();
    }
    if (upgradeManager?.setConstitutionalGuard) {
      await (await upgradeManager.setConstitutionalGuard(await constitutionalGuard.getAddress())).wait();
    }
    if (upgradeManager?.setGovernance) {
      await (await upgradeManager.setGovernance(executorAddress, ethers.ZeroAddress)).wait();
    }
    if (upgradeManager?.transferOwnership) {
      await (await upgradeManager.transferOwnership(executorAddress)).wait();
      console.log(`UpgradeManager ownership transferred to ProposalExecutor`);
    }

    console.log("\nGovernance-only deployment complete.");
    console.log(`Governor: ${await governor.getAddress()}`);
    console.log(`ProposalExecutor: ${executorAddress}`);
    console.log(`GhostConstitution: ${await constitution.getAddress()}`);
    console.log(`ConstitutionalGuard: ${await constitutionalGuard.getAddress()}`);
    console.log(`EvidenceAnchor: ${await evidenceAnchor.getAddress()}`);
    console.log(`EvidenceBundle: ${await evidenceBundle.getAddress()}`);
    console.log(`EvidenceVault: ${await evidenceVault.getAddress()}`);
    console.log(`PolicyRegistry: ${await policyRegistry.getAddress()}`);
    console.log(`AIProposalExecutor: ${await aiProposalExecutor.getAddress()}`);
    console.log(`UpgradeManager: ${await upgradeManager.getAddress()}`);
    return;
  }

  const UNBONDING_PERIOD = Number(process.env.UNBONDING_PERIOD ?? 0); // seconds
  const MIN_STAKE_WEI = BigInt(process.env.MIN_STAKE_WEI ?? 0);
  const DOWNTIME_SLASH_BPS = Number(process.env.DOWNTIME_SLASH_BPS ?? 50); // 0.5%
  const CHALLENGE_WINDOW = Number(process.env.L3_CHALLENGE_WINDOW ?? 600); // seconds
  const CHECKPOINT_INTERVAL = Number(process.env.L2_CHECKPOINT_INTERVAL ?? 300); // seconds (informational)
  const provider = deployer.provider;
  if (!provider) {
    throw new Error("Missing provider");
  }
  const network = await provider.getNetwork();
  const chainId = Number(process.env.CHAIN_ID ?? network.chainId);
  const BLOCK_GAS_LIMIT = Number(process.env.BLOCK_GAS_LIMIT ?? 30_000_000);
  const BASE_FEE_GWEI = Number(process.env.BASE_FEE_GWEI ?? 1);
  const ELASTICITY_MULTIPLIER = Number(process.env.ELASTICITY_MULTIPLIER ?? 2);
  const BASE_FEE_MAX_CHANGE_DENOMINATOR = Number(process.env.BASE_FEE_MAX_CHANGE_DENOMINATOR ?? 8);
  const FEE_MARKET_BASE_FEE_GWEI = Number(process.env.FEE_MARKET_BASE_FEE_GWEI ?? BASE_FEE_GWEI);
  const FEE_MARKET_PRIORITY_FEE_GWEI = Number(process.env.FEE_MARKET_PRIORITY_FEE_GWEI ?? 1);
  const FEE_MARKET_TARGET_GAS = Number(process.env.FEE_MARKET_TARGET_GAS ?? 15_000_000);
  const FEE_MARKET_ADJUSTMENT_BPS = Number(process.env.FEE_MARKET_ADJUSTMENT_BPS ?? 100);
  const STABLE_COLLATERAL_RATIO_BPS = Number(process.env.STABLE_COLLATERAL_RATIO_BPS ?? 15_000);
  const PSM_FEE_BPS = Number(process.env.PSM_FEE_BPS ?? 30);
  const PRECOMPILES = (process.env.PRECOMPILES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const TRANSFER_ADMIN_TO_GOVERNOR = process.env.TRANSFER_ADMIN_TO_GOVERNOR !== "false";
  const GENESIS_HASH = process.env.GENESIS_HASH ?? ethers.ZeroHash;
  const GENESIS_RAW = process.env.GENESIS_RAW ?? "0x";
  const canonicalGasToken =
    process.env.CANONICAL_GAS_TOKEN_ADDRESS ??
    process.env.GHOST_TOKEN_ADDRESS ??
    "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const allowNativeDeploy = process.env.ALLOW_NATIVE_TOKEN_DEPLOY === "1";

  const precompiles = [
    "0x0000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000002",
    "0x0000000000000000000000000000000000000003",
    "0x0000000000000000000000000000000000000004",
    "0x0000000000000000000000000000000000000005",
    "0x0000000000000000000000000000000000000006",
    "0x0000000000000000000000000000000000000007",
    "0x0000000000000000000000000000000000000008",
    "0x0000000000000000000000000000000000000009",
    "0x000000000000000000000000000000000000000a"
  ];

  // Core chain/execution config
  const consensus = await deploy<any>("ConsensusParams", [deployer.address]);
  const chainConfig = await deploy<any>("ChainConfigV2", [deployer.address]);
  const genesis = await deploy<any>("GenesisConfigV2", [deployer.address, GENESIS_HASH, GENESIS_RAW]);
  const execution = await deploy<any>("ExecutionConfigV2", [deployer.address, chainId, BLOCK_GAS_LIMIT]);
  const baseFeeWei = ethers.parseUnits(BASE_FEE_GWEI.toString(), "gwei");
  await (
    await execution.setGasModel(chainId, BLOCK_GAS_LIMIT, baseFeeWei, ELASTICITY_MULTIPLIER, BASE_FEE_MAX_CHANGE_DENOMINATOR)
  ).wait();
  if (PRECOMPILES.length > 0) {
    const precompileAddrs = PRECOMPILES.map((entry) => ethers.getAddress(entry));
    await (await execution.setPrecompiles(precompileAddrs)).wait();
  }
  await (
    await execution.setGasModel(
      chainId,
      BLOCK_GAS_LIMIT,
      ethers.parseUnits(BASE_FEE_GWEI.toString(), "gwei"),
      ELASTICITY_MULTIPLIER,
      BASE_FEE_MAX_CHANGE_DENOMINATOR
    )
  ).wait();
  await (await execution.setPrecompiles(precompiles)).wait();

  // Monetary + treasury
  const treasury = await deploy<Deployable>("TreasuryV2", [deployer.address]);
  let nativeTokenAddress = canonicalGasToken;
  let native: Deployable | null = null;
  if (canonicalGasToken) {
    const tokenCode = await provider.getCode(canonicalGasToken);
    if (tokenCode && tokenCode !== "0x") {
      console.log(`[token] Using canonical gas token at ${canonicalGasToken}`);
    } else if (allowNativeDeploy) {
      native = await deploy<Deployable>("NativeTokenV2", [deployer.address]);
      nativeTokenAddress = await native.getAddress();
      console.log(`[token] Deployed NativeTokenV2 at ${nativeTokenAddress}`);
    } else {
      throw new Error(
        `Canonical gas token not found at ${canonicalGasToken}. ` +
          `Set CANONICAL_GAS_TOKEN_ADDRESS/GHOST_TOKEN_ADDRESS to a deployed ERC20 ` +
          `or set ALLOW_NATIVE_TOKEN_DEPLOY=1 to deploy NativeTokenV2.`
      );
    }
  } else if (allowNativeDeploy) {
    native = await deploy<Deployable>("NativeTokenV2", [deployer.address]);
    nativeTokenAddress = await native.getAddress();
    console.log(`[token] Deployed NativeTokenV2 at ${nativeTokenAddress}`);
  } else {
    throw new Error("Missing CANONICAL_GAS_TOKEN_ADDRESS/GHOST_TOKEN_ADDRESS and ALLOW_NATIVE_TOKEN_DEPLOY is false.");
  }
  const feeMarket = await deploy<Deployable>("FeeMarketV2", [
    deployer.address,
    ethers.parseUnits(FEE_MARKET_BASE_FEE_GWEI.toString(), "gwei"),
    ethers.parseUnits(FEE_MARKET_PRIORITY_FEE_GWEI.toString(), "gwei"),
    FEE_MARKET_TARGET_GAS,
    FEE_MARKET_ADJUSTMENT_BPS
  ]);

  // Staking & slashing
  const staking = await deploy<Deployable>("StakingManagerV2", [deployer.address, treasury.getAddress()]);
  const slashing = await deploy<Deployable>("SlashingManagerV2", [deployer.address, staking.getAddress()]);
  await (await staking.setSlashManager(await slashing.getAddress())).wait();
  if (UNBONDING_PERIOD > 0 || MIN_STAKE_WEI > 0n) {
    await (await staking.setParams(UNBONDING_PERIOD, MIN_STAKE_WEI)).wait();
  }
  if (DOWNTIME_SLASH_BPS > 0) {
    await (await slashing.setParams(DOWNTIME_SLASH_BPS)).wait();
  }

  // Rewards
  const rewards = await deploy<Deployable>("RewardDistributorV2", [deployer.address, treasury.getAddress()]);

  // Stablecoin system
  const stable = await deploy<Deployable>("Stablecoin", [deployer.address]);
  const vault = await deploy<Deployable>("CollateralVault", [deployer.address]);
  await (await vault.setCollateralAsset(nativeTokenAddress, true)).wait();
  const oracle = await deploy<Deployable>("PriceOracleRouter", [deployer.address]);
  // simple oracle price: 1 native = $1
  await (
    await oracle.setPrice(
      ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [nativeTokenAddress])),
      ethers.parseUnits("1", 18)
    )
  ).wait();
  const controller = await deploy<Deployable>("StablecoinController", [
    deployer.address,
    stable.getAddress(),
    vault.getAddress(),
    oracle.getAddress(),
    STABLE_COLLATERAL_RATIO_BPS
  ]);
  await (await vault.setController(await controller.getAddress())).wait();
  const psm = await deploy<Deployable>("PegStabilityModule", [
    deployer.address,
    stable.getAddress(),
    nativeTokenAddress,
    PSM_FEE_BPS
  ]);
  // grant mint/burn privileges
  await (await stable.setMinter(await controller.getAddress(), true)).wait();
  await (await stable.setMinter(await psm.getAddress(), true)).wait();
  await (await stable.setBurner(await controller.getAddress(), true)).wait();
  await (await stable.setBurner(await psm.getAddress(), true)).wait();

  // Bridge + rollup base
  const router = await deploy<Deployable>("BridgeRouter", [deployer.address]);
  const tokenBridge = await deploy<Deployable>("TokenBridge", [deployer.address]);
  const nftBridge = await deploy<Deployable>("NFTBridge", [deployer.address]);
  const rollupMgr = await deploy<Deployable>("RollupManagerV2", [deployer.address]);
  const batchInbox = await deploy<Deployable>("BatchInbox", [deployer.address]);
  const sequencers = await deploy<Deployable>("SequencerRegistry", [deployer.address]);
  const batcherBond = await deploy<Deployable>("BatcherBondManager", [deployer.address]);
  const disputes = await deploy<Deployable>("DisputeGameFactoryV2", [deployer.address]);
  const outputOracle = await deploy<Deployable>("OutputOracle", [deployer.address]);
  const finalization = await deploy<Deployable>("FinalizationManager", [
    deployer.address,
    disputes.getAddress(),
    outputOracle.getAddress(),
    CHALLENGE_WINDOW
  ]);
  const checkpointMgr = await deploy<Deployable>("CheckpointManager", [deployer.address]);

  // Governance
  const govToken = await deploy<Deployable>("GovernanceToken", [deployer.address]);
  const ve = await deploy<Deployable>("VotingEscrow", [deployer.address]);
  // Resilience
  const pauseGuardian = await deploy<Deployable>("PauseGuardianV2", [deployer.address]);
  const emergency = await deploy<Deployable>("EmergencyShutdownV2", [deployer.address]);
  const forkRecovery = await deploy<Deployable>("ForkRecoveryManager", [deployer.address]);

  // Governance
  const executor = await deploy<any>("ProposalExecutorV2", [deployer.address]);
  const governor = await deploy<any>("GovernorV2", [
    deployer.address,
    ve.getAddress(),
    executor.getAddress(),
    ethers.parseUnits("1000"), // quorum
    60, // voting delay
    3600, // voting period
    600 // timelock
  ]);
  await (await executor.transferAdmin(await governor.getAddress())).wait();
  const addressBook = await deploy<any>("AddressBook", [deployer.address]);
  const upgradeManager = await deploy<any>("UpgradeManagerV2", [deployer.address]);
  await (await upgradeManager.transferAdmin(await governor.getAddress())).wait();
  if (TRANSFER_ADMIN_TO_GOVERNOR) {
    const govAddress = await governor.getAddress();
    await (await consensus.transferAdmin(govAddress)).wait();
    await (await chainConfig.transferAdmin(govAddress)).wait();
    await (await genesis.transferAdmin(govAddress)).wait();
    await (await execution.transferAdmin(govAddress)).wait();
  }

  // AI security + automation
  const aiSecurityOracle = await deploy<Deployable>("AISecurityOracle", [deployer.address]);
  const anomalyDetector = await deploy<Deployable>("AnomalyDetector", [deployer.address]);
  const txClassifier = await deploy<Deployable>("TransactionClassifier", [deployer.address]);
  const keeperRegistry = await deploy<Deployable>("KeeperRegistry", [deployer.address]);
  const autonomousExecutor = await deploy<Deployable>("AutonomousExecutor", [deployer.address]);
  const predictiveGas = await deploy<Deployable>("PredictiveGasManager", [deployer.address]);
  const contractRegistry = await deploy<Deployable>("ContractRegistry", [deployer.address]);

  // Register key addresses for off-chain services
  await (await addressBook.setAddress(ethers.id("CONSENSUS_PARAMS"), await consensus.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("CHAIN_CONFIG"), await chainConfig.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("GENESIS_CONFIG"), await genesis.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("EXECUTION_CONFIG"), await execution.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("TREASURY"), await treasury.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("STAKING"), await staking.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("SLASHING"), await slashing.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("REWARDS"), await rewards.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("NATIVE_TOKEN"), nativeTokenAddress)).wait();
  await (await addressBook.setAddress(ethers.id("STABLE"), await stable.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("VAULT"), await vault.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("ORACLE"), await oracle.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("CONTROLLER"), await controller.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("PSM"), await psm.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("TOKEN_BRIDGE"), await tokenBridge.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("NFT_BRIDGE"), await nftBridge.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("ROLLUP_MANAGER"), await rollupMgr.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("BATCH_INBOX"), await batchInbox.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("SEQUENCERS"), await sequencers.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("BATCHER_BOND"), await batcherBond.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("DISPUTES"), await disputes.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("OUTPUT_ORACLE"), await outputOracle.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("FINALIZATION"), await finalization.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("CHECKPOINT_MANAGER"), await checkpointMgr.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("GOVERNOR"), await governor.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("EXECUTOR"), await executor.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("UPGRADE_MANAGER"), await upgradeManager.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("PAUSE"), await pauseGuardian.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("EMERGENCY"), await emergency.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("FORK_RECOVERY"), await forkRecovery.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("AI_SECURITY_ORACLE"), await aiSecurityOracle.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("ANOMALY_DETECTOR"), await anomalyDetector.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("TX_CLASSIFIER"), await txClassifier.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("KEEPER_REGISTRY"), await keeperRegistry.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("AUTONOMOUS_EXECUTOR"), await autonomousExecutor.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("PREDICTIVE_GAS_MANAGER"), await predictiveGas.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("CONTRACT_REGISTRY"), await contractRegistry.getAddress())).wait();

  console.log("\nDeployment complete.");
  console.log(`UNBONDING_PERIOD=${UNBONDING_PERIOD}s, MIN_STAKE_WEI=${MIN_STAKE_WEI}, DOWNTIME_SLASH_BPS=${DOWNTIME_SLASH_BPS}, L3_CHALLENGE_WINDOW=${CHALLENGE_WINDOW}s, L2_CHECKPOINT_INTERVAL=${CHECKPOINT_INTERVAL}s`);

  emitEnv("TREASURY", await treasury.getAddress());
  emitEnv("NATIVE_TOKEN", nativeTokenAddress);
  emitEnv("FEE_MARKET", await feeMarket.getAddress());
  emitEnv("STAKING", await staking.getAddress());
  emitEnv("SLASHING", await slashing.getAddress());
  emitEnv("REWARDS", await rewards.getAddress());
  emitEnv("STABLE", await stable.getAddress());
  emitEnv("VAULT", await vault.getAddress());
  emitEnv("ORACLE", await oracle.getAddress());
  emitEnv("CONTROLLER", await controller.getAddress());
  emitEnv("PSM", await psm.getAddress());
  emitEnv("BRIDGE_ROUTER", await router.getAddress());
  emitEnv("TOKEN_BRIDGE", await tokenBridge.getAddress());
  emitEnv("NFT_BRIDGE", await nftBridge.getAddress());
  emitEnv("ROLLUP_MANAGER", await rollupMgr.getAddress());
  emitEnv("BATCH_INBOX", await batchInbox.getAddress());
  emitEnv("SEQUENCERS", await sequencers.getAddress());
  emitEnv("BATCHER_BOND", await batcherBond.getAddress());
  emitEnv("DISPUTES", await disputes.getAddress());
  emitEnv("OUTPUT_ORACLE", await outputOracle.getAddress());
  emitEnv("FINALIZATION", await finalization.getAddress());
  emitEnv("CHECKPOINT_MANAGER", await checkpointMgr.getAddress());
  emitEnv("GOV_TOKEN", await govToken.getAddress());
  emitEnv("VOTING_ESCROW", await ve.getAddress());
  emitEnv("GOVERNOR", await governor.getAddress());
  emitEnv("EXECUTOR", await executor.getAddress());
  emitEnv("UPGRADE_MANAGER", await upgradeManager.getAddress());
  emitEnv("CONSENSUS_PARAMS", await consensus.getAddress());
  emitEnv("CHAIN_CONFIG", await chainConfig.getAddress());
  emitEnv("GENESIS_CONFIG", await genesis.getAddress());
  emitEnv("EXECUTION_CONFIG", await execution.getAddress());
  emitEnv("PAUSE_GUARDIAN", await pauseGuardian.getAddress());
  emitEnv("EMERGENCY", await emergency.getAddress());
  emitEnv("FORK_RECOVERY", await forkRecovery.getAddress());
  emitEnv("AI_SECURITY_ORACLE", await aiSecurityOracle.getAddress());
  emitEnv("ANOMALY_DETECTOR", await anomalyDetector.getAddress());
  emitEnv("TX_CLASSIFIER", await txClassifier.getAddress());
  emitEnv("KEEPER_REGISTRY", await keeperRegistry.getAddress());
  emitEnv("AUTONOMOUS_EXECUTOR", await autonomousExecutor.getAddress());
  emitEnv("PREDICTIVE_GAS_MANAGER", await predictiveGas.getAddress());
  emitEnv("CONTRACT_REGISTRY", await contractRegistry.getAddress());
  emitEnv("ADDRESS_BOOK", await addressBook.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
