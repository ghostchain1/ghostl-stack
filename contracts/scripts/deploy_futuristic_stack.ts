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

  const UNBONDING_PERIOD = Number(process.env.UNBONDING_PERIOD ?? 0); // seconds
  const MIN_STAKE_WEI = BigInt(process.env.MIN_STAKE_WEI ?? 0);
  const DOWNTIME_SLASH_BPS = Number(process.env.DOWNTIME_SLASH_BPS ?? 50); // 0.5%
  const CHALLENGE_WINDOW = Number(process.env.L3_CHALLENGE_WINDOW ?? 600); // seconds
  const CHECKPOINT_INTERVAL = Number(process.env.L2_CHECKPOINT_INTERVAL ?? 300); // seconds (informational)

  // Monetary + treasury
  const treasury = await deploy<Deployable>("TreasuryV2", [deployer.address]);
  const native = await deploy<Deployable>("NativeTokenV2", [deployer.address]);
  const feeMarket = await deploy<Deployable>("FeeMarketV2", [
    deployer.address,
    ethers.parseUnits("1", "gwei"),
    ethers.parseUnits("1", "gwei"),
    15_000_000, // target gas per block
    100 // 1% adjustment factor
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
  await (await vault.setCollateralAsset(await native.getAddress(), true)).wait();
  const oracle = await deploy<Deployable>("PriceOracleRouter", [deployer.address]);
  // simple oracle price: 1 native = $1
  await (await oracle.setPrice(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await native.getAddress()])), ethers.parseUnits("1", 18))).wait();
  const controller = await deploy<Deployable>("StablecoinController", [
    deployer.address,
    stable.getAddress(),
    vault.getAddress(),
    oracle.getAddress(),
    15_000 // 150% collateral ratio
  ]);
  await (await vault.setController(await controller.getAddress())).wait();
  const psm = await deploy<Deployable>("PegStabilityModule", [
    deployer.address,
    stable.getAddress(),
    native.getAddress(),
    30 // 0.30% fee
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
  const governor = await deploy<Deployable>("GovernorV2", [
    deployer.address,
    ve.getAddress(),
    ethers.parseUnits("1000"), // quorum
    60, // voting delay
    3600, // voting period
    600 // timelock
  ]);
  const executor = await deploy<Deployable>("ProposalExecutorV2", [deployer.address]);
  const addressBook = await deploy<Deployable>("AddressBook", [deployer.address]);

  // Register key addresses for off-chain services
  await (await addressBook.setAddress(ethers.id("TREASURY"), await treasury.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("STAKING"), await staking.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("SLASHING"), await slashing.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("REWARDS"), await rewards.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("NATIVE_TOKEN"), await native.getAddress())).wait();
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
  await (await addressBook.setAddress(ethers.id("PAUSE"), await pauseGuardian.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("EMERGENCY"), await emergency.getAddress())).wait();
  await (await addressBook.setAddress(ethers.id("FORK_RECOVERY"), await forkRecovery.getAddress())).wait();

  console.log("\nDeployment complete.");
  console.log(`UNBONDING_PERIOD=${UNBONDING_PERIOD}s, MIN_STAKE_WEI=${MIN_STAKE_WEI}, DOWNTIME_SLASH_BPS=${DOWNTIME_SLASH_BPS}, L3_CHALLENGE_WINDOW=${CHALLENGE_WINDOW}s, L2_CHECKPOINT_INTERVAL=${CHECKPOINT_INTERVAL}s`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
