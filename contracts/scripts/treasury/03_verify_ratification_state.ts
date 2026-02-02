/* eslint-disable no-console */
import { ethers } from "ethers";

const RPC_L1 = process.env.RPC_L1 ?? "http://localhost:18545";

const LEGACY_TREASURY_ADDRESS = process.env.LEGACY_TREASURY_ADDRESS;
const TREASURY_VAULT_ADDRESS = process.env.TREASURY_VAULT_ADDRESS;
const TREASURY_CONTROLLER_ADDRESS = process.env.TREASURY_CONTROLLER_ADDRESS;
const TREASURY_POLICY_ADDRESS = process.env.TREASURY_POLICY_ADDRESS;
const TREASURY_GUARD_ADDRESS = process.env.TREASURY_GUARD_ADDRESS;
const TREASURY_RECEIPTS_ADDRESS = process.env.TREASURY_RECEIPTS_ADDRESS;
const PROPOSAL_EXECUTOR_ADDRESS = process.env.PROPOSAL_EXECUTOR_ADDRESS;

function requireAddress(name: string, value: string | undefined) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return ethers.getAddress(value);
}

async function requireContract(provider: ethers.JsonRpcProvider, label: string, addr: string) {
  const code = await provider.getCode(addr);
  if (!code || code === "0x") {
    throw new Error(`not_contract:${label}:${addr}`);
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_L1);
  const legacyTreasury = requireAddress("LEGACY_TREASURY_ADDRESS", LEGACY_TREASURY_ADDRESS);
  const vault = requireAddress("TREASURY_VAULT_ADDRESS", TREASURY_VAULT_ADDRESS);
  const controller = requireAddress("TREASURY_CONTROLLER_ADDRESS", TREASURY_CONTROLLER_ADDRESS);
  const policy = requireAddress("TREASURY_POLICY_ADDRESS", TREASURY_POLICY_ADDRESS);
  const guard = requireAddress("TREASURY_GUARD_ADDRESS", TREASURY_GUARD_ADDRESS);
  const receipts = requireAddress("TREASURY_RECEIPTS_ADDRESS", TREASURY_RECEIPTS_ADDRESS);
  const executor = requireAddress("PROPOSAL_EXECUTOR_ADDRESS", PROPOSAL_EXECUTOR_ADDRESS);

  await Promise.all([
    requireContract(provider, "legacyTreasury", legacyTreasury),
    requireContract(provider, "vault", vault),
    requireContract(provider, "controller", controller),
    requireContract(provider, "policy", policy),
    requireContract(provider, "guard", guard),
    requireContract(provider, "receipts", receipts),
    requireContract(provider, "executor", executor)
  ]);

  const governedAbi = ["function governor() external view returns (address)", "function timelock() external view returns (address)"];
  const legacyAbi = governedAbi.concat([
    "function legacyWithdrawalsFrozen() external view returns (bool)"
  ]);
  const vaultAbi = ["function controller() external view returns (address)"];
  const controllerAbi = governedAbi.concat([
    "function policy() external view returns (address)",
    "function guard() external view returns (address)",
    "function receipts() external view returns (address)"
  ]);
  const policyAbi = [
    "function controller() external view returns (address)",
    "function minReserve() external view returns (uint256)",
    "function epochBudget() external view returns (uint256)",
    "function epochLength() external view returns (uint256)",
    "function maxRiskScoreBps() external view returns (uint256)",
    "function policyVersion() external view returns (uint256)"
  ];
  const guardAbi = [
    "function policy() external view returns (address)",
    "function receipts() external view returns (address)",
    "function controller() external view returns (address)",
    "function enabled() external view returns (bool)",
    "function emergencyFreeze() external view returns (bool)"
  ];
  const receiptsAbi = ["function controller() external view returns (address)"];
  const executorAbi = ["function delay() external view returns (uint256)"];

  const legacy = new ethers.Contract(legacyTreasury, legacyAbi, provider);
  const vaultContract = new ethers.Contract(vault, vaultAbi, provider);
  const controllerContract = new ethers.Contract(controller, controllerAbi, provider);
  const policyContract = new ethers.Contract(policy, policyAbi, provider);
  const guardContract = new ethers.Contract(guard, guardAbi, provider);
  const receiptsContract = new ethers.Contract(receipts, receiptsAbi, provider);
  const executorContract = new ethers.Contract(executor, executorAbi, provider);

  const [legacyGovernor, legacyTimelock, frozen] = await Promise.all([
    legacy.governor(),
    legacy.timelock(),
    legacy.legacyWithdrawalsFrozen()
  ]);
  if (legacyGovernor.toLowerCase() !== controller.toLowerCase()) {
    throw new Error("legacy_governor_not_controller");
  }
  if (legacyTimelock !== ethers.ZeroAddress) {
    throw new Error("legacy_timelock_should_be_zero");
  }
  if (!frozen) {
    throw new Error("legacy_withdrawals_not_frozen");
  }

  const vaultController = await vaultContract.controller();
  if (vaultController.toLowerCase() !== controller.toLowerCase()) {
    throw new Error("vault_controller_mismatch");
  }

  const [controllerGovernor, controllerTimelock, controllerPolicy, controllerGuard, controllerReceipts] = await Promise.all([
    controllerContract.governor(),
    controllerContract.timelock(),
    controllerContract.policy(),
    controllerContract.guard(),
    controllerContract.receipts()
  ]);
  if (controllerGovernor.toLowerCase() !== executor.toLowerCase() && controllerTimelock.toLowerCase() !== executor.toLowerCase()) {
    throw new Error("controller_not_governed_by_executor");
  }
  if (controllerPolicy.toLowerCase() !== policy.toLowerCase()) {
    throw new Error("controller_policy_mismatch");
  }
  if (controllerGuard.toLowerCase() !== guard.toLowerCase()) {
    throw new Error("controller_guard_mismatch");
  }
  if (controllerReceipts.toLowerCase() !== receipts.toLowerCase()) {
    throw new Error("controller_receipts_mismatch");
  }

  const [policyController, minReserve, epochBudget, epochLength, maxRiskScoreBps, policyVersion] = await Promise.all([
    policyContract.controller(),
    policyContract.minReserve(),
    policyContract.epochBudget(),
    policyContract.epochLength(),
    policyContract.maxRiskScoreBps(),
    policyContract.policyVersion()
  ]);
  if (policyController.toLowerCase() !== controller.toLowerCase()) {
    throw new Error("policy_controller_mismatch");
  }
  if (policyVersion === 0n) {
    throw new Error("policy_version_zero");
  }

  const [guardPolicy, guardReceipts, guardController, guardEnabled, guardFrozen] = await Promise.all([
    guardContract.policy(),
    guardContract.receipts(),
    guardContract.controller(),
    guardContract.enabled(),
    guardContract.emergencyFreeze()
  ]);
  if (guardPolicy.toLowerCase() !== policy.toLowerCase()) {
    throw new Error("guard_policy_mismatch");
  }
  if (guardReceipts.toLowerCase() !== receipts.toLowerCase()) {
    throw new Error("guard_receipts_mismatch");
  }
  if (guardController.toLowerCase() !== controller.toLowerCase()) {
    throw new Error("guard_controller_mismatch");
  }
  if (!guardEnabled) {
    throw new Error("guard_disabled");
  }
  if (guardFrozen) {
    throw new Error("guard_emergency_frozen");
  }

  const receiptsController = await receiptsContract.controller();
  if (receiptsController.toLowerCase() !== controller.toLowerCase()) {
    throw new Error("receipts_controller_mismatch");
  }

  const delay = await executorContract.delay();
  if (delay === 0n) {
    throw new Error("executor_delay_zero");
  }

  console.log("[ratification] verification ok");
  console.log("[ratification] policy:", {
    minReserve: minReserve.toString(),
    epochBudget: epochBudget.toString(),
    epochLength: epochLength.toString(),
    maxRiskScoreBps: maxRiskScoreBps.toString()
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
