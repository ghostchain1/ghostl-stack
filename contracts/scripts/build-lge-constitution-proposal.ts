/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { AbiCoder, ghost } from "ghost";
import {
  EXECUTOR_ABI_FRAGMENTS,
  buildCall,
  buildExecutorCalldata,
  computeGovernorHash,
  computeProposalHash,
  type ExecutorMode
} from "./governance/build_proposal_calldata";

type EnvMap = Record<string, string>;

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_STACK_ENV = path.join(REPO_ROOT, "services", "stack.env");

const OUTPUT_DIR =
  process.env.LGE_CONSTITUTION_OUTPUT_DIR ||
  path.join(REPO_ROOT, "contracts", "reports");

const OUTPUT_QUEUE =
  process.env.LGE_CONSTITUTION_QUEUE_OUTPUT ||
  path.join(OUTPUT_DIR, "lge_constitution_queue.json");

const OUTPUT_ACTIVATE =
  process.env.LGE_CONSTITUTION_ACTIVATE_OUTPUT ||
  path.join(OUTPUT_DIR, "lge_constitution_activate.json");

const DESCRIPTION_QUEUE =
  process.env.LGE_CONSTITUTION_DESCRIPTION_QUEUE ||
  "LGE Constitution v1 (phase 1): wire components, lock caps, queue reward splits";

const DESCRIPTION_ACTIVATE =
  process.env.LGE_CONSTITUTION_DESCRIPTION_ACTIVATE ||
  "LGE Constitution v1 (phase 2): activate queued reward splits";

const STACK_ENV_PATH = process.env.STACK_ENV_PATH || DEFAULT_STACK_ENV;

function parseEnvFile(envPath: string): EnvMap {
  if (!fs.existsSync(envPath)) return {};
  const out: EnvMap = {};
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function requireAddress(name: string, value: string | undefined) {
  if (!value || !ghost.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return ghost.getAddress(value);
}

function optionalAddress(value: string | undefined) {
  if (!value) return "";
  if (!ghost.isAddress(value)) return "";
  return ghost.getAddress(value);
}

function parseAdapterIds(raw: string | undefined) {
  const value = (raw || "1")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ids = value.map((s) => Number(s));
  if (ids.length === 0 || ids.some((id) => !Number.isFinite(id) || id <= 0)) {
    throw new Error(`invalid_LGE_ADAPTER_IDS:${raw ?? ""}`);
  }
  return ids;
}

function parseAsset(raw: string | undefined, fallback: string) {
  const value = (raw || "").trim();
  if (!value) return requireAddress("ASSET_FALLBACK", fallback);
  if (value.toLowerCase() === "native") return ghost.ZeroAddress;
  return requireAddress("ASSET", value);
}

function toBigint(raw: string | undefined, fallback: bigint) {
  if (!raw || raw.trim().length === 0) return fallback;
  try {
    const v = BigInt(raw);
    if (v < 0n) throw new Error("neg");
    return v;
  } catch {
    throw new Error(`invalid_bigint:${raw}`);
  }
}

const POLICY_REGISTRY_ABI = [
  "function setPolicySetting(bytes32 key,uint256 min,uint256 max,uint64 activationDelay,uint64 emergencyExpiry,uint64 rollbackWindow,bool hasBounds,bool enabled) external",
  "function applyPolicy(bytes32 key,uint256 value,bytes32 evidenceHash) external returns (bool)"
] as const;

const ADAPTER_REGISTRY_ABI = [
  "function configureAdapter(uint256 adapterId,(uint256 externalChainId,uint8 riskTier,uint256 maxDeployCap,uint64 settlementInterval,uint8 proofType,address operator,bool paused,bool enabled,uint64 updatedAt) config) external"
] as const;

const BREAKER_ABI = [
  "function setVault(address vault) external",
  "function setEmergencyPauser(address account,bool allowed) external"
] as const;

const ORACLE_ABI = [
  "function setVault(address vault) external",
  "function setFeeReceiver(address feeReceiver) external",
  "function setRelayer(address relayer,bool allowed) external",
  "function setMinRelayers(uint256 minRelayers) external"
] as const;

const VAULT_ABI = [
  "function configureAsset(address asset,(bool supported,uint256 maxTotalDeployed,bool depositsEnabled,bool withdrawalsEnabled) config) external",
  "function setGlobalStrategyAllowed(bytes32 strategyId,bool allowed) external"
] as const;

const REWARD_ROUTER_ABI = [
  "function setSettlementOracle(address oracle) external",
  "function setSplitDelaySeconds(uint64 delaySeconds) external",
  "function queueConfig(address polReceiver,address burnReceiver,address validatorReceiver,uint16 polBps,uint16 burnBps,uint16 validatorBps) external returns (uint64 eta)",
  "function activateConfig() external"
] as const;

function keyMaxTotalDeployed(asset: string) {
  const coder = AbiCoder.defaultAbiCoder();
  return ghost.keccak256(coder.encode(["string", "address"], ["ghost.lge.maxTotalDeployed", asset]));
}

function keyAdapterCap(adapterId: number, asset: string) {
  const coder = AbiCoder.defaultAbiCoder();
  return ghost.keccak256(coder.encode(["string", "uint256", "address"], ["ghost.lge.adapterCap", adapterId, asset]));
}

function buildPhase1(env: EnvMap) {
  const policyRegistry = requireAddress(
    "POLICY_REGISTRY_ADDRESS",
    process.env.POLICY_REGISTRY_ADDRESS || env.POLICY_REGISTRY_ADDRESS || env.AGENT_POLICY_CONTRACT
  );

  const executor = requireAddress(
    "EXECUTOR_ADDRESS_L1",
    process.env.PROPOSAL_EXECUTOR_ADDRESS || env.EXECUTOR_ADDRESS_L1 || env.PROPOSAL_EXECUTOR_CONTRACT
  );

  const vault = requireAddress("LGE_VAULT_ADDRESS", process.env.LGE_VAULT_ADDRESS || env.LGE_VAULT_ADDRESS);
  const oracle = requireAddress("LGE_ORACLE_ADDRESS", process.env.LGE_ORACLE_ADDRESS || env.LGE_ORACLE_ADDRESS);
  const adapterRegistry = requireAddress(
    "LGE_ADAPTER_REGISTRY_ADDRESS",
    process.env.LGE_ADAPTER_REGISTRY_ADDRESS || env.LGE_ADAPTER_REGISTRY_ADDRESS
  );
  const breaker = requireAddress(
    "LGE_CIRCUIT_BREAKER_ADDRESS",
    process.env.LGE_CIRCUIT_BREAKER_ADDRESS || env.LGE_CIRCUIT_BREAKER_ADDRESS
  );
  const rewardRouter = requireAddress(
    "LGE_REWARD_ROUTER_ADDRESS",
    process.env.LGE_REWARD_ROUTER_ADDRESS || env.LGE_REWARD_ROUTER_ADDRESS
  );

  const canonicalGasToken = requireAddress(
    "CANONICAL_GAS_TOKEN_ADDRESS",
    process.env.CANONICAL_GAS_TOKEN_ADDRESS || env.CANONICAL_GAS_TOKEN_ADDRESS || env.GAS_TOKEN_ADDRESS_L1
  );

  const adapterIds = parseAdapterIds(process.env.LGE_ADAPTER_IDS || env.LGE_ADAPTER_IDS);
  const asset = parseAsset(process.env.LGE_DEPLOY_ASSET || env.LGE_DEPLOY_ASSET || env.LGE_SETTLEMENT_ASSET, canonicalGasToken);

  const evidenceHash = ghost.isHexString(process.env.LGE_CONSTITUTION_EVIDENCE_HASH || "", 32)
    ? (process.env.LGE_CONSTITUTION_EVIDENCE_HASH as string)
    : ghost.id(process.env.LGE_CONSTITUTION_EVIDENCE_HASH || "ghost.evidence.lge_constitution.v1");

  const maxTotalDeployedWei = toBigint(
    process.env.LGE_MAX_TOTAL_DEPLOYED_WEI || env.LGE_MAX_TOTAL_DEPLOYED_WEI,
    ghost.parseEther("200")
  );

  const perAdapterCapWei = toBigint(
    process.env.LGE_ADAPTER_CAP_WEI || env.LGE_ADAPTER_CAP_WEI,
    ghost.parseEther("100")
  );

  const splitDelaySeconds = Number(process.env.LGE_SPLIT_DELAY_SECONDS || env.LGE_SPLIT_DELAY_SECONDS || "86400");
  if (!Number.isFinite(splitDelaySeconds) || splitDelaySeconds <= 0 || splitDelaySeconds > 30 * 86400) {
    throw new Error(`invalid_LGE_SPLIT_DELAY_SECONDS:${splitDelaySeconds}`);
  }

  const governorAddress = optionalAddress(process.env.GOVERNOR_ADDRESS_L1 || env.GOVERNOR_ADDRESS_L1 || env.GOVERNANCE_CONTRACT_ADDRESS);
  if (!governorAddress) {
    throw new Error("missing_GOVERNOR_ADDRESS_L1");
  }

  const polReceiver = optionalAddress(process.env.LGE_POL_RECEIVER || env.LGE_POL_RECEIVER) || governorAddress;
  const feeReceiver = optionalAddress(process.env.LGE_FEE_RECEIVER || env.LGE_FEE_RECEIVER) || governorAddress;
  const burnReceiver = optionalAddress(process.env.LGE_BURN_RECEIVER || env.LGE_BURN_RECEIVER) || ghost.ZeroAddress;
  const validatorReceiver = optionalAddress(process.env.LGE_VALIDATOR_RECEIVER || env.LGE_VALIDATOR_RECEIVER) || governorAddress;

  const polBps = Number(process.env.LGE_POL_BPS || env.LGE_POL_BPS || "5000");
  const burnBps = Number(process.env.LGE_BURN_BPS || env.LGE_BURN_BPS || "3000");
  const validatorBps = Number(process.env.LGE_VALIDATOR_BPS || env.LGE_VALIDATOR_BPS || "2000");
  if (polBps < 0 || burnBps < 0 || validatorBps < 0 || polBps + burnBps + validatorBps !== 10_000) {
    throw new Error("invalid_reward_splits_bps_sum");
  }

  const strategyIdRaw = (process.env.LGE_STRATEGY_ID || env.LGE_STRATEGY_ID || "").trim();
  const strategyId = strategyIdRaw
    ? (ghost.isHexString(strategyIdRaw, 32) ? strategyIdRaw : ghost.keccak256(ghost.toUtf8Bytes(strategyIdRaw)))
    : ghost.keccak256(ghost.toUtf8Bytes("lge.strategy.default"));

  const calls = [];

  // Wire LGE components.
  calls.push(buildCall(rewardRouter, REWARD_ROUTER_ABI, "setSettlementOracle", [oracle]));
  calls.push(buildCall(breaker, BREAKER_ABI, "setVault", [vault]));
  calls.push(buildCall(breaker, BREAKER_ABI, "setEmergencyPauser", [oracle, true]));
  calls.push(buildCall(oracle, ORACLE_ABI, "setVault", [vault]));
  calls.push(buildCall(oracle, ORACLE_ABI, "setFeeReceiver", [feeReceiver]));

  // Configure RewardRouter split timelock and queue desired config.
  calls.push(buildCall(rewardRouter, REWARD_ROUTER_ABI, "setSplitDelaySeconds", [splitDelaySeconds]));
  calls.push(buildCall(rewardRouter, REWARD_ROUTER_ABI, "queueConfig", [polReceiver, burnReceiver, validatorReceiver, polBps, burnBps, validatorBps]));

  // Ensure vault supports the configured asset and default strategy is enabled.
  calls.push(
    buildCall(vault, VAULT_ABI, "configureAsset", [
      asset,
      {
        supported: true,
        maxTotalDeployed: maxTotalDeployedWei,
        depositsEnabled: true,
        withdrawalsEnabled: true
      }
    ])
  );
  calls.push(buildCall(vault, VAULT_ABI, "setGlobalStrategyAllowed", [strategyId, true]));

  // Configure adapters and policy caps.
  const externalChainId = toBigint(process.env.LGE_DEFAULT_EXTERNAL_CHAIN_ID || env.LGE_DEFAULT_EXTERNAL_CHAIN_ID, 137n);
  const settlementIntervalSec = toBigint(process.env.LGE_DEFAULT_SETTLEMENT_INTERVAL_SEC || env.LGE_DEFAULT_SETTLEMENT_INTERVAL_SEC, 86400n);

  const operatorAddress =
    optionalAddress(process.env.LGE_OPERATOR_ADDRESS || env.LGE_OPERATOR_ADDRESS) ||
    (() => {
      const pk = (process.env.LGE_OPERATOR_PRIVATE_KEY || env.LGE_OPERATOR_PRIVATE_KEY || "").trim();
      if (!pk) return "";
      try {
        return new ghost.Wallet(pk).address;
      } catch {
        return "";
      }
    })();

  if (!operatorAddress) {
    throw new Error("missing_LGE_OPERATOR_ADDRESS_or_LGE_OPERATOR_PRIVATE_KEY");
  }

  for (const id of adapterIds) {
    calls.push(
      buildCall(adapterRegistry, ADAPTER_REGISTRY_ABI, "configureAdapter", [
        id,
        {
          externalChainId,
          riskTier: 1,
          maxDeployCap: perAdapterCapWei,
          settlementInterval: settlementIntervalSec,
          proofType: 1, // ECDSA_ATTESTATION
          operator: operatorAddress,
          paused: false,
          enabled: true,
          updatedAt: 0
        }
      ])
    );

    const capKey = keyAdapterCap(id, asset);
    calls.push(
      buildCall(policyRegistry, POLICY_REGISTRY_ABI, "setPolicySetting", [
        capKey,
        perAdapterCapWei,
        perAdapterCapWei,
        0,
        0,
        0,
        true,
        true
      ])
    );
    calls.push(buildCall(policyRegistry, POLICY_REGISTRY_ABI, "applyPolicy", [capKey, perAdapterCapWei, evidenceHash]));
  }

  const totalKey = keyMaxTotalDeployed(asset);
  calls.push(
    buildCall(policyRegistry, POLICY_REGISTRY_ABI, "setPolicySetting", [
      totalKey,
      maxTotalDeployedWei,
      maxTotalDeployedWei,
      0,
      0,
      0,
      true,
      true
    ])
  );
  calls.push(buildCall(policyRegistry, POLICY_REGISTRY_ABI, "applyPolicy", [totalKey, maxTotalDeployedWei, evidenceHash]));

  // Optional relayer allowlist from env private keys.
  const relayerPksRaw = (process.env.LGE_RELAYER_PRIVATE_KEYS || env.LGE_RELAYER_PRIVATE_KEYS || "").trim();
  if (relayerPksRaw) {
    const pks = relayerPksRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const relayerAddrs = pks.map((pk) => new ghost.Wallet(pk).address);
    for (const relayerAddr of relayerAddrs) {
      calls.push(buildCall(oracle, ORACLE_ABI, "setRelayer", [relayerAddr, true]));
    }
    calls.push(buildCall(oracle, ORACLE_ABI, "setMinRelayers", [relayerAddrs.length]));
  }

  const execBundle = buildExecutorCalldata(EXECUTOR_ABI_FRAGMENTS, calls, process.env.PROPOSAL_EXECUTOR_MODE as ExecutorMode | undefined);

  return {
    meta: {
      stackEnvPath: STACK_ENV_PATH
    },
    description: DESCRIPTION_QUEUE,
    evidenceHash,
    addresses: {
      policyRegistry,
      executor,
      vault,
      oracle,
      adapterRegistry,
      breaker,
      rewardRouter
    },
    params: {
      asset,
      adapterIds,
      maxTotalDeployedWei: maxTotalDeployedWei.toString(),
      perAdapterCapWei: perAdapterCapWei.toString(),
      splitDelaySeconds,
      strategyId
    },
    calls: calls.map((call) => ({ ...call, value: call.value.toString() })),
    executor: {
      target: executor,
      mode: execBundle.mode,
      calldata: execBundle.calldata,
      proposalHash: computeProposalHash(executor, execBundle.calldata, DESCRIPTION_QUEUE)
    },
    proposal: {
      target: executor,
      value: "0",
      data: execBundle.calldata
    },
    governorHash: computeGovernorHash(executor, 0n, execBundle.calldata, DESCRIPTION_QUEUE),
    generatedAt: new Date().toISOString()
  };
}

function buildPhase2(env: EnvMap) {
  const executor = requireAddress(
    "EXECUTOR_ADDRESS_L1",
    process.env.PROPOSAL_EXECUTOR_ADDRESS || env.EXECUTOR_ADDRESS_L1 || env.PROPOSAL_EXECUTOR_CONTRACT
  );
  const rewardRouter = requireAddress(
    "LGE_REWARD_ROUTER_ADDRESS",
    process.env.LGE_REWARD_ROUTER_ADDRESS || env.LGE_REWARD_ROUTER_ADDRESS
  );

  const calls = [buildCall(rewardRouter, REWARD_ROUTER_ABI, "activateConfig", [])];
  const execBundle = buildExecutorCalldata(EXECUTOR_ABI_FRAGMENTS, calls, process.env.PROPOSAL_EXECUTOR_MODE as ExecutorMode | undefined);

  return {
    meta: {
      stackEnvPath: STACK_ENV_PATH
    },
    description: DESCRIPTION_ACTIVATE,
    calls: calls.map((call) => ({ ...call, value: call.value.toString() })),
    executor: {
      target: executor,
      mode: execBundle.mode,
      calldata: execBundle.calldata,
      proposalHash: computeProposalHash(executor, execBundle.calldata, DESCRIPTION_ACTIVATE)
    },
    proposal: {
      target: executor,
      value: "0",
      data: execBundle.calldata
    },
    governorHash: computeGovernorHash(executor, 0n, execBundle.calldata, DESCRIPTION_ACTIVATE),
    generatedAt: new Date().toISOString()
  };
}

function main() {
  const env = parseEnvFile(STACK_ENV_PATH);

  const phase1 = buildPhase1(env);
  const phase2 = buildPhase2(env);

  fs.mkdirSync(path.dirname(OUTPUT_QUEUE), { recursive: true });
  fs.writeFileSync(OUTPUT_QUEUE, JSON.stringify(phase1, null, 2), "utf8");
  fs.mkdirSync(path.dirname(OUTPUT_ACTIVATE), { recursive: true });
  fs.writeFileSync(OUTPUT_ACTIVATE, JSON.stringify(phase2, null, 2), "utf8");

  console.log("[lge-constitution] phase1:", OUTPUT_QUEUE);
  console.log("[lge-constitution] phase2:", OUTPUT_ACTIVATE);
}

main();
