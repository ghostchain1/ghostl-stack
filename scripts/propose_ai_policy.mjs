/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { ghost } from "@ghostchain/sdk";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CONFIG_PATH = process.env.AI_POLICY_CONFIG || path.join(ROOT_DIR, "ops", "governance", "ai-policy-l2.json");
const OUTPUT_PATH = process.env.AI_POLICY_OUT || path.join(ROOT_DIR, "ops", "governance", "ai-policy-proposal.json");
const DESCRIPTION = process.env.PROPOSAL_DESCRIPTION || "Update L2 AI policy registry";
const POLICY_REGISTRY_ADDRESS = process.env.POLICY_REGISTRY_ADDRESS;
const GOVERNOR_ADDRESS = process.env.GOVERNOR_ADDRESS;
const EXECUTOR_ADDRESS = process.env.PROPOSAL_EXECUTOR_ADDRESS;
const EXECUTOR_MODE = process.env.PROPOSAL_EXECUTOR_MODE;

const EXECUTOR_ABI = [
  "function executeBatch(address[] targets,uint256[] values,bytes[] datas) external",
  "function execute(address target,uint256 value,bytes data) external",
  "function execute(address target,bytes data) external"
];

const POLICY_REGISTRY_ABI = [
  "function setRolePolicy(bytes32 role,bytes32 policyHash,bool enabled) external",
  "function setExecutor(address executor,bool allowed) external",
  "function setActionPolicy(bytes32 role,bytes32 action,bool enabled,uint8 tier,uint64 cooldownSeconds,uint16 approvalsRequired,bool evidenceRequired,bytes32 scope,bytes32 evidenceHash) external"
];

const normalizeAddress = (name, value) => {
  if (!value || !ghost.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return ghost.getAddress(value);
};

const normalizeBytes32 = (value, label) => {
  if (!value) return ghost.ZeroHash;
  if (ghost.isHexString(value, 32)) return value;
  try {
    return ghost.id(String(value));
  } catch (err) {
    throw new Error(`invalid_${label}:${value}`);
  }
};

const stableStringify = (obj) => {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map((v) => stableStringify(v)).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
};

const computePolicyHash = (policy) => {
  const payload = stableStringify(policy);
  return ghost.keccak256(ghost.toUtf8Bytes(payload));
};

const hasFunction = (iface, signature) => {
  try {
    iface.getFunction(signature);
    return true;
  } catch {
    return false;
  }
};

const buildExecutorCalldata = (executorAbi, calls, mode) => {
  const iface = new ghost.Interface(executorAbi);
  const resolvedMode =
    mode ||
    (hasFunction(iface, "executeBatch(address[],uint256[],bytes[])")
      ? "batch"
      : hasFunction(iface, "execute(address,uint256,bytes)")
        ? "single"
        : hasFunction(iface, "execute(address,bytes)")
          ? "v2"
          : "none");
  if (resolvedMode === "none") throw new Error("executor_mode_unavailable");
  if (resolvedMode === "batch") {
    return {
      mode: resolvedMode,
      calldata: iface.encodeFunctionData("executeBatch", [
        calls.map((c) => c.target),
        calls.map((c) => c.value),
        calls.map((c) => c.data)
      ])
    };
  }
  if (calls.length !== 1) throw new Error(`executor_mode_requires_single_call:${resolvedMode}`);
  const call = calls[0];
  if (resolvedMode === "single") {
    return {
      mode: resolvedMode,
      calldata: iface.encodeFunctionData("execute(address,uint256,bytes)", [call.target, call.value, call.data])
    };
  }
  return {
    mode: resolvedMode,
    calldata: iface.encodeFunctionData("execute(address,bytes)", [call.target, call.data])
  };
};

const computeGovernorHash = (target, value, calldata, description) => {
  const coder = ghost.AbiCoder.defaultAbiCoder();
  return ghost.keccak256(coder.encode(["address", "uint256", "bytes", "string"], [target, value, calldata, description]));
};

const computeProposalHash = (executor, calldata, description) => {
  const coder = ghost.AbiCoder.defaultAbiCoder();
  return ghost.keccak256(coder.encode(["address", "bytes", "string"], [executor, calldata, description]));
};

if (!fs.existsSync(CONFIG_PATH)) {
  throw new Error(`missing policy config: ${CONFIG_PATH}`);
}

const policyConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const policyRegistry = normalizeAddress("POLICY_REGISTRY_ADDRESS", POLICY_REGISTRY_ADDRESS);

const role = normalizeBytes32(policyConfig.role, "role");
const policyHash = policyConfig.policyHash ? normalizeBytes32(policyConfig.policyHash, "policyHash") : computePolicyHash(policyConfig);
const enabled = policyConfig.enabled !== false;
const executors = Array.isArray(policyConfig.executors) ? policyConfig.executors : [];
const actions = Array.isArray(policyConfig.actions) ? policyConfig.actions : [];

const registryIface = new ghost.Interface(POLICY_REGISTRY_ABI);
const calls = [];

calls.push({
  target: policyRegistry,
  value: 0n,
  data: registryIface.encodeFunctionData("setRolePolicy", [role, policyHash, enabled])
});

executors.forEach((executor) => {
  const addr = normalizeAddress("executor", executor);
  calls.push({
    target: policyRegistry,
    value: 0n,
    data: registryIface.encodeFunctionData("setExecutor", [addr, true])
  });
});

actions.forEach((action) => {
  const actionHash = normalizeBytes32(action.name, "action");
  const scopeHash = normalizeBytes32(action.scope || "L2", "scope");
  const evidenceHash = normalizeBytes32(action.evidenceHash || ghost.ZeroHash, "evidenceHash");
  calls.push({
    target: policyRegistry,
    value: 0n,
    data: registryIface.encodeFunctionData("setActionPolicy", [
      role,
      actionHash,
      action.enabled !== false,
      Number(action.tier || 0),
      Number(action.cooldownSeconds || 0),
      Number(action.approvalsRequired || 0),
      Boolean(action.evidenceRequired),
      scopeHash,
      evidenceHash
    ])
  });
});

const callBundle = calls.map((call) => ({
  ...call,
  governorHash: computeGovernorHash(call.target, call.value, call.data, DESCRIPTION)
}));

let executorBundle = null;
if (EXECUTOR_ADDRESS) {
  const executor = normalizeAddress("PROPOSAL_EXECUTOR_ADDRESS", EXECUTOR_ADDRESS);
  const bundle = buildExecutorCalldata(EXECUTOR_ABI, calls, EXECUTOR_MODE);
  executorBundle = {
    executor,
    mode: bundle.mode,
    calldata: bundle.calldata,
    proposalHash: computeProposalHash(executor, bundle.calldata, DESCRIPTION)
  };
}

const output = {
  description: DESCRIPTION,
  createdAt: new Date().toISOString(),
  policyRegistry,
  role,
  policyHash,
  governor: GOVERNOR_ADDRESS || null,
  calls: callBundle,
  executor: executorBundle
};

const json = JSON.stringify(
  output,
  (_, value) => (typeof value === "bigint" ? value.toString() : value),
  2
);
fs.writeFileSync(OUTPUT_PATH, json);
console.log(`[ai-policy] wrote proposal bundle: ${OUTPUT_PATH}`);
console.log(`[ai-policy] calls: ${calls.length}`);
if (!GOVERNOR_ADDRESS) {
  console.log("[ai-policy] GOVERNOR_ADDRESS not set; calldata emitted only.");
}
