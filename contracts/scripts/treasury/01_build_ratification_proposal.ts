/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { ghost } from "ghost";
import {
  EXECUTOR_ABI_FRAGMENTS,
  buildCall,
  buildExecutorCalldata,
  computeGovernorHash,
  computeProposalHash,
  type ExecutorMode
} from "../governance/build_proposal_calldata";

const OUTPUT_PATH =
  process.env.RATIFICATION_OUTPUT_PATH ||
  path.join(process.cwd(), "contracts", "scripts", "treasury", "ratification_proposal.json");

const EXECUTOR_ADDRESS = process.env.PROPOSAL_EXECUTOR_ADDRESS;
const EXECUTOR_MODE = process.env.PROPOSAL_EXECUTOR_MODE as ExecutorMode | undefined;
const DESCRIPTION =
  process.env.RATIFICATION_DESCRIPTION ||
  "Treasury Ratification: lock treasury behind controller + policy";

const LEGACY_TREASURY_ADDRESS = process.env.LEGACY_TREASURY_ADDRESS;
const TREASURY_VAULT_ADDRESS = process.env.TREASURY_VAULT_ADDRESS;
const TREASURY_CONTROLLER_ADDRESS = process.env.TREASURY_CONTROLLER_ADDRESS;
const TREASURY_POLICY_ADDRESS = process.env.TREASURY_POLICY_ADDRESS;
const TREASURY_GUARD_ADDRESS = process.env.TREASURY_GUARD_ADDRESS;
const TREASURY_RECEIPTS_ADDRESS = process.env.TREASURY_RECEIPTS_ADDRESS;
const TREASURY_ROUTER_ADDRESS = process.env.TREASURY_ROUTER_ADDRESS;
const FEDERATION_ROUTER_ADDRESS = process.env.FEDERATION_ROUTER_ADDRESS;

const MIN_RESERVE = process.env.TREASURY_MIN_RESERVE ?? "100000"; // in GST
const EPOCH_BUDGET = process.env.TREASURY_EPOCH_BUDGET ?? "25000"; // in GST
const EPOCH_LENGTH_SECONDS = process.env.TREASURY_EPOCH_LENGTH_SECONDS ?? "86400";
const MAX_RISK_SCORE_BPS = process.env.TREASURY_MAX_RISK_SCORE_BPS ?? "7500";

const toGhost = (value: string) => ghost.parseUnits(value, 18);

function requireAddress(name: string, value: string | undefined) {
  if (!value || !ghost.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return ghost.getAddress(value);
}

const LEGACY_TREASURY_ABI = [
  "function withdrawNativeAll(address to) external",
  "function setLegacyWithdrawalsFrozen(bool frozen) external",
  "function setGovernance(address governor,address timelock) external"
] as const;

const TREASURY_POLICY_ABI = [
  "function configurePolicy(uint256 minReserve,uint256 epochBudget,uint256 epochLength,uint256 maxRiskScoreBps,bool receiptsRequired) external",
  "function setController(address controller,bool lockController) external"
] as const;

const TREASURY_RECEIPTS_ABI = ["function setController(address controller,bool lockController) external"] as const;

const TREASURY_GUARD_ABI = [
  "function setPolicy(address policy) external",
  "function setReceipts(address receipts) external",
  "function setController(address controller) external"
] as const;

const TREASURY_CONTROLLER_ABI = [
  "function setComponents(address policy,address guard,address receipts,address router,address federationRouter) external"
] as const;

const TREASURY_ROUTER_ABI = ["function setController(address controller) external"] as const;

const FEDERATION_ROUTER_ABI = ["function setController(address controller) external"] as const;

function main() {
  const legacyTreasury = requireAddress("LEGACY_TREASURY_ADDRESS", LEGACY_TREASURY_ADDRESS);
  const vault = requireAddress("TREASURY_VAULT_ADDRESS", TREASURY_VAULT_ADDRESS);
  const controller = requireAddress("TREASURY_CONTROLLER_ADDRESS", TREASURY_CONTROLLER_ADDRESS);
  const policy = requireAddress("TREASURY_POLICY_ADDRESS", TREASURY_POLICY_ADDRESS);
  const guard = requireAddress("TREASURY_GUARD_ADDRESS", TREASURY_GUARD_ADDRESS);
  const receipts = requireAddress("TREASURY_RECEIPTS_ADDRESS", TREASURY_RECEIPTS_ADDRESS);

  const calls = [];

  // 1) sweep legacy funds into the new vault
  calls.push(buildCall(legacyTreasury, LEGACY_TREASURY_ABI, "withdrawNativeAll", [vault]));
  // 2) freeze legacy withdraws
  calls.push(buildCall(legacyTreasury, LEGACY_TREASURY_ABI, "setLegacyWithdrawalsFrozen", [true]));
  // 3) configure policy + controller bindings
  calls.push(
    buildCall(policy, TREASURY_POLICY_ABI, "configurePolicy", [
      toGhost(MIN_RESERVE),
      toGhost(EPOCH_BUDGET),
      BigInt(EPOCH_LENGTH_SECONDS),
      BigInt(MAX_RISK_SCORE_BPS),
      true
    ])
  );
  calls.push(buildCall(policy, TREASURY_POLICY_ABI, "setController", [controller, true]));
  calls.push(buildCall(receipts, TREASURY_RECEIPTS_ABI, "setController", [controller, true]));
  calls.push(buildCall(guard, TREASURY_GUARD_ABI, "setPolicy", [policy]));
  calls.push(buildCall(guard, TREASURY_GUARD_ABI, "setReceipts", [receipts]));
  calls.push(buildCall(guard, TREASURY_GUARD_ABI, "setController", [controller]));

  // 4) wire controller components
  const router = TREASURY_ROUTER_ADDRESS ? requireAddress("TREASURY_ROUTER_ADDRESS", TREASURY_ROUTER_ADDRESS) : ghost.ZeroAddress;
  const federation = FEDERATION_ROUTER_ADDRESS
    ? requireAddress("FEDERATION_ROUTER_ADDRESS", FEDERATION_ROUTER_ADDRESS)
    : ghost.ZeroAddress;
  calls.push(buildCall(controller, TREASURY_CONTROLLER_ABI, "setComponents", [policy, guard, receipts, router, federation]));

  // 5) optional router controller wiring
  if (TREASURY_ROUTER_ADDRESS) {
    calls.push(buildCall(router, TREASURY_ROUTER_ABI, "setController", [controller]));
  }
  if (FEDERATION_ROUTER_ADDRESS) {
    calls.push(buildCall(federation, FEDERATION_ROUTER_ABI, "setController", [controller]));
  }

  // 6) lock legacy treasury governance to controller (post-freeze)
  calls.push(buildCall(legacyTreasury, LEGACY_TREASURY_ABI, "setGovernance", [controller, ghost.ZeroAddress]));

  const serializedCalls = calls.map((call) => ({
    ...call,
    value: call.value.toString()
  }));

  const payload: Record<string, unknown> = {
    description: DESCRIPTION,
    calls: serializedCalls,
    generatedAt: new Date().toISOString()
  };

  let executorTarget: string | null = null;
  let executorCalldata: string | null = null;
  let executorMode: ExecutorMode | null = null;

  if (EXECUTOR_ADDRESS) {
    const executor = requireAddress("PROPOSAL_EXECUTOR_ADDRESS", EXECUTOR_ADDRESS);
    const execBundle = buildExecutorCalldata(EXECUTOR_ABI_FRAGMENTS, calls, EXECUTOR_MODE);
    executorTarget = executor;
    executorCalldata = execBundle.calldata;
    executorMode = execBundle.mode;
    payload["executor"] = {
      target: executorTarget,
      mode: execBundle.mode,
      calldata: execBundle.calldata,
      proposalHash: computeProposalHash(executor, execBundle.calldata, DESCRIPTION)
    };
  }

  payload["governorHash"] = executorTarget && executorCalldata
    ? computeGovernorHash(executorTarget, 0n, executorCalldata, DESCRIPTION)
    : computeGovernorHash(calls[0].target, calls[0].value, calls[0].data, DESCRIPTION);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");

  console.log("[ratification] calls:", calls.length);
  console.log("[ratification] output:", OUTPUT_PATH);
  if (executorTarget) {
    console.log("[ratification] executor:", executorTarget, "mode:", executorMode);
  } else {
    console.log("[ratification] executor not configured; proposal will target first call only");
  }
}

main();
