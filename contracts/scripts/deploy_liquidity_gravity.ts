/* eslint-disable no-console */
import { ghost, artifacts, network } from "hardhat";
import fs from "fs";
import path from "path";
import crypto from "node:crypto";

function getEnv(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env: ${name}`);
  return v;
}

function optionalEnv(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

async function resolveOrDeployPolicyRegistry(governor: string, timelock: string) {
  const existing = optionalEnv("POLICY_REGISTRY_ADDRESS", "");
  if (existing && ghost.isAddress(existing)) {
    const code = await ghost.provider.getCode(existing);
    if (code && code !== "0x") {
      return ghost.getAddress(existing);
    }
  }
  const constitutionHash =
    optionalEnv("STACK_CONSTITUTION_HASH", "") ||
    optionalEnv("CONSTITUTION_HASH", "") ||
    ghost.keccak256(ghost.toUtf8Bytes("lge.constitution.dev"));
  const PolicyRegistry = await ghost.getContractFactory("PolicyRegistry");
  const registry = await PolicyRegistry.deploy(governor, timelock, constitutionHash);
  await registry.waitForDeployment();
  return registry.target as string;
}

async function main() {
  const outputDir = getEnv("OUTPUT_DIR", path.join(process.cwd(), "deployments", network.name));
  const outputFile = getEnv("OUTPUT_FILE", path.join(outputDir, "liquidity_gravity.json"));
  const version = process.env.CONTRACTS_VERSION ?? "0.0.1";

  const [deployer] = await ghost.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const feeReceiver = ghost.getAddress(optionalEnv("LGE_FEE_RECEIVER", optionalEnv("TREASURY_ADDRESS", deployer.address)));
  const polReceiver = ghost.getAddress(optionalEnv("LGE_POL_RECEIVER", optionalEnv("TREASURY_ADDRESS", deployer.address)));
  const burnReceiver = ghost.getAddress(optionalEnv("LGE_BURN_RECEIVER", ghost.ZeroAddress));
  const validatorReceiver = ghost.getAddress(optionalEnv("LGE_VALIDATOR_RECEIVER", optionalEnv("TREASURY_ADDRESS", deployer.address)));
  const gasToken = optionalEnv("GAS_TOKEN_ADDRESS_L1", optionalEnv("CANONICAL_GAS_TOKEN_ADDRESS", ""));

  const governor = ghost.getAddress(optionalEnv("LGE_GOVERNOR", deployer.address));
  const timelock = ghost.getAddress(optionalEnv("LGE_TIMELOCK", ghost.ZeroAddress));

  const policyRegistryAddress = await resolveOrDeployPolicyRegistry(governor, timelock);
  console.log(`PolicyRegistry: ${policyRegistryAddress}`);

  const AdapterRegistry = await ghost.getContractFactory("AdapterRegistry");
  const adapterRegistry = await AdapterRegistry.deploy(governor, timelock);
  await adapterRegistry.waitForDeployment();
  console.log(`AdapterRegistry: ${adapterRegistry.target as string}`);

  const CircuitBreaker = await ghost.getContractFactory("CircuitBreaker");
  const breaker = await CircuitBreaker.deploy(governor, timelock);
  await breaker.waitForDeployment();
  console.log(`CircuitBreaker: ${breaker.target as string}`);

  const OperatorBondVault = await ghost.getContractFactory("OperatorBondVault");
  const bondVault = await OperatorBondVault.deploy(governor, timelock);
  await bondVault.waitForDeployment();
  console.log(`OperatorBondVault: ${bondVault.target as string}`);

  const RewardRouter = await ghost.getContractFactory("RewardRouter");
  const rewardRouter = await RewardRouter.deploy(governor, timelock);
  await rewardRouter.waitForDeployment();
  console.log(`RewardRouter: ${rewardRouter.target as string}`);

  const SettlementOracle = await ghost.getContractFactory("SettlementOracle");
  const oracle = await SettlementOracle.deploy(
    governor,
    timelock,
    adapterRegistry.target as string,
    breaker.target as string,
    rewardRouter.target as string,
    bondVault.target as string
  );
  await oracle.waitForDeployment();
  console.log(`SettlementOracle: ${oracle.target as string}`);

  const LoadBalancerVault = await ghost.getContractFactory("LoadBalancerVault");
  const vault = await LoadBalancerVault.deploy(
    governor,
    timelock,
    adapterRegistry.target as string,
    oracle.target as string,
    breaker.target as string,
    policyRegistryAddress
  );
  await vault.waitForDeployment();
  console.log(`LoadBalancerVault: ${vault.target as string}`);

  const BridgeEscrow = await ghost.getContractFactory("BridgeEscrow");
  const bridgeEscrow = await BridgeEscrow.deploy(governor, timelock);
  await bridgeEscrow.waitForDeployment();
  console.log(`BridgeEscrow: ${bridgeEscrow.target as string}`);

  // Optional: wrapped native token for native bridge escrow custody.
  let wrappedNative = optionalEnv("LGE_WRAPPED_NATIVE_ADDRESS", "");
  if (wrappedNative && ghost.isAddress(wrappedNative)) {
    const code = await ghost.provider.getCode(wrappedNative);
    if (!code || code === "0x") wrappedNative = "";
  }
  if (!wrappedNative) {
    const WrappedNativeToken = await ghost.getContractFactory("WrappedNativeToken");
    const wn = await WrappedNativeToken.deploy("Wrapped Native", "WNATIVE");
    await wn.waitForDeployment();
    wrappedNative = wn.target as string;
    console.log(`WrappedNativeToken: ${wrappedNative}`);
  }

  // Wire components (dev path only; production should use governance proposals if governor != deployer).
  if (governor === deployer.address || timelock === deployer.address) {
    await (await rewardRouter.setSettlementOracle(oracle.target as string)).wait();
    if (gasToken && ghost.isAddress(gasToken)) {
      await (await rewardRouter.setGasToken(gasToken)).wait();
    }

    // Configure default receivers via timelocked queue/activate.
    await (await rewardRouter.setSplitDelaySeconds(10)).wait();
    await (await rewardRouter.queueConfig(polReceiver, burnReceiver, validatorReceiver, 5000, 3000, 2000)).wait();
    // dev activate immediately after delay.
    await ghost.provider.send("evm_increaseTime", [11]);
    await (await rewardRouter.activateConfig()).wait();

    await (await breaker.setVault(vault.target as string)).wait();
    await (await breaker.setEmergencyPauser(oracle.target as string, true)).wait();
    await (await oracle.setVault(vault.target as string)).wait();
    await (await oracle.setFeeReceiver(feeReceiver)).wait();

    await (await bridgeEscrow.setVault(vault.target as string)).wait();
    await (await bridgeEscrow.setWrappedNative(wrappedNative)).wait();
    await (await vault.setBridgeEscrow(bridgeEscrow.target as string)).wait();

    // Minimal dev config: allow native deposits/deploys and register an adapter.
    const operatorFromPk = optionalEnv("LGE_OPERATOR_PRIVATE_KEY", "");
    const operator = operatorFromPk ? new ghost.Wallet(operatorFromPk).address : deployer.address;
    const adapterId = Number(optionalEnv("LGE_DEFAULT_ADAPTER_ID", "1"));
    const extChainId = BigInt(optionalEnv("LGE_DEFAULT_EXTERNAL_CHAIN_ID", "137"));
    const maxCap = BigInt(optionalEnv("LGE_DEFAULT_MAX_DEPLOY_CAP_WEI", ghost.parseEther("100").toString()));
    const interval = Number(optionalEnv("LGE_DEFAULT_SETTLEMENT_INTERVAL_SEC", "86400"));

    await (
      await adapterRegistry.configureAdapter(adapterId, {
        externalChainId: extChainId,
        riskTier: 1,
        maxDeployCap: maxCap,
        settlementInterval: interval,
        proofType: 1,
        operator,
        paused: false,
        enabled: true,
        updatedAt: 0
      })
    ).wait();

    await (
      await vault.configureAsset(ghost.ZeroAddress, {
        supported: true,
        maxTotalDeployed: BigInt(optionalEnv("LGE_DEFAULT_MAX_TOTAL_DEPLOYED_WEI", ghost.parseEther("200").toString())),
        depositsEnabled: true,
        withdrawalsEnabled: true
      })
    ).wait();
    await (await vault.setGlobalStrategyAllowed(ghost.id("lge.strategy.mock"), true)).wait();

    await (await oracle.setRelayer(operator, true)).wait();
    await (await oracle.setMinRelayers(1)).wait();
  } else {
    console.log("Skipped wiring setters (governance-controlled). Use liquidityctl proposal commands to configure.");
  }

  const contracts = [
    { name: "PolicyRegistry", address: policyRegistryAddress },
    { name: "AdapterRegistry", address: adapterRegistry.target as string },
    { name: "CircuitBreaker", address: breaker.target as string },
    { name: "OperatorBondVault", address: bondVault.target as string },
    { name: "RewardRouter", address: rewardRouter.target as string },
    { name: "SettlementOracle", address: oracle.target as string },
    { name: "LoadBalancerVault", address: vault.target as string },
    { name: "BridgeEscrow", address: bridgeEscrow.target as string }
  ];

  const chainId = Number((await ghost.provider.getNetwork()).chainId);
  const enriched = await Promise.all(
    contracts.map(async (entry) => {
      const artifact = await artifacts.readArtifact(entry.name);
      const abiHash = crypto.createHash("sha256").update(JSON.stringify(artifact.abi)).digest("hex");
      return {
        name: entry.name,
        address: entry.address,
        chainId,
        layer: "l1",
        abi: artifact.abi,
        abiHash,
        version,
        deployedAt: new Date().toISOString()
      };
    })
  );

  const result = { network: network.name, layer: "l1", contracts: enriched };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2) + "\n");
  console.log(`Wrote deployments to ${outputFile}`);

  console.log("\n--- stack.env updates ---");
  console.log(`LGE_VAULT_ADDRESS=${vault.target as string}`);
  console.log(`LGE_ORACLE_ADDRESS=${oracle.target as string}`);
  console.log(`LGE_ADAPTER_REGISTRY_ADDRESS=${adapterRegistry.target as string}`);
  console.log(`LGE_CIRCUIT_BREAKER_ADDRESS=${breaker.target as string}`);
  console.log(`LGE_REWARD_ROUTER_ADDRESS=${rewardRouter.target as string}`);
  console.log(`LGE_BRIDGE_ESCROW_ADDRESS=${bridgeEscrow.target as string}`);
  console.log(`LGE_WRAPPED_NATIVE_ADDRESS=${wrappedNative}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
