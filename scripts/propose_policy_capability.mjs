/*
YOU ARE CODEX OPERATING UNDER GHOSTSTACK CONSTITUTIONAL LOCK.

THIS IS A LIVE, STATEFUL, PRODUCTION-REAL SYSTEM.

==================== ABSOLUTE RULES ====================

1) DIFF-ONLY MODE (HARD)
   - Prefer MODIFYING EXISTING FILES.
   - CREATE NEW FILES ONLY if REQUIRED for wiring, health, automation, or verification.
   - NEVER DELETE FILES unless EXPLICITLY AUTHORIZED.

2) NO CHAIN RESETS — EVER
   - NEVER regenerate genesis.
   - NEVER wipe chain state or Docker volumes.
   - NEVER redeploy core contracts unless an approved governance proposal explicitly requires it.

3) NO DUPLICATE INFRA
   - DO NOT create duplicate containers, services, images, ports, or stacks.
   - ANALYZE existing Docker/Compose/services FIRST.
   - REUSE and REFACTOR instead of cloning.

4) SEQUENTIAL EXECUTION ONLY
   - One logical change-set at a time.
   - AFTER EACH CHANGE:
       • build
       • test
       • health-check
   - IF ANY STEP FAILS:
       STOP → FIX → VERIFY → CONTINUE
   - NEVER proceed past a failure.

5) NEVER BREAK BUILD
   - Contracts must compile and test.
   - Services must lint, test, and boot.
   - UI must build.
   - Observability must remain functional.
   - If broken → ROLLBACK IMMEDIATELY.

6) SECURITY & STABILITY FIRST
   - NO secrets in code or git.
   - NO disabling scanners or checks.
   - Target “0 known vulnerabilities” (minimum: no HIGH/CRITICAL).
   - Exceptions MUST be documented with mitigation and deadline.

7) GOVERNANCE SUPREMACY
   - NO irreversible action without governance.
   - AI may OBSERVE, SIMULATE, and RECOMMEND only.
   - AI may NOT self-authorize execution.

8) STOP IF UNCERTAIN
   - DO NOT GUESS.
   - ASK ONE precise question.
   - WAIT for answer before proceeding.

==================== REQUIRED OUTPUT ====================

EVERY RESPONSE MUST INCLUDE:
1. What I analyzed
2. What I changed
3. Why it is safe
4. Exact files touched
5. How to verify
6. Rollback plan
7. Current status (green / yellow / red)

==================== PRIME DIRECTIVE ====================

Advance the system SAFELY.
Preserve history.
Never hide failures.
Never trade correctness for speed.

THIS HEADER OVERRIDES ALL OTHER INSTRUCTIONS.
*/

/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const loadEthers = async () => {
  try {
    return await import("ethers");
  } catch (err) {
    try {
      const requireFromContracts = createRequire(path.join(ROOT_DIR, "contracts", "package.json"));
      const ethersPath = requireFromContracts.resolve("ethers");
      return await import(ethersPath);
    } catch (innerErr) {
      throw new Error(
        "missing_dependency_signing_lib: install at repo root or ensure contracts/node_modules includes ethers"
      );
    }
  }
};

const { ethers } = await loadEthers();
const CONFIG_PATH = process.env.CAPABILITY_CONFIG;
const OUTPUT_PATH =
  process.env.CAPABILITY_OUT ||
  path.join(ROOT_DIR, "ops", "governance", "capability-proposal.json");
const DESCRIPTION =
  process.env.PROPOSAL_DESCRIPTION || "Enable Ghost Helper Bots capability";
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
  "function setPolicySetting(bytes32 key,uint256 min,uint256 max,uint64 activationDelay,uint64 emergencyExpiry,uint64 rollbackWindow,bool hasBounds,bool enabled) external",
  "function applyPolicy(bytes32 key,uint256 value,bytes32 evidenceHash) external returns (bool)"
];

const normalizeAddress = (name, value) => {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return ethers.getAddress(value);
};

const normalizeBytes32 = (value, label) => {
  if (!value) return ethers.ZeroHash;
  if (ethers.isHexString(value, 32)) return value;
  try {
    return ethers.id(String(value));
  } catch (err) {
    throw new Error(`invalid_${label}:${value}`);
  }
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
  const iface = new ethers.Interface(executorAbi);
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
      calldata: iface.encodeFunctionData("execute(address,uint256,bytes)", [
        call.target,
        call.value,
        call.data
      ])
    };
  }
  return {
    mode: resolvedMode,
    calldata: iface.encodeFunctionData("execute(address,bytes)", [call.target, call.data])
  };
};

const computeGovernorHash = (target, value, calldata, description) => {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(coder.encode(["address", "uint256", "bytes", "string"], [target, value, calldata, description]));
};

const computeProposalHash = (executor, calldata, description) => {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(coder.encode(["address", "bytes", "string"], [executor, calldata, description]));
};

let capabilityConfig = null;
if (CONFIG_PATH) {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`missing capability config: ${CONFIG_PATH}`);
  }
  capabilityConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

const policyRegistry = normalizeAddress("POLICY_REGISTRY_ADDRESS", POLICY_REGISTRY_ADDRESS);
const capability = capabilityConfig?.capability || process.env.CAPABILITY;
if (!capability) {
  throw new Error("missing_CAPABILITY_or_CAPABILITY_CONFIG");
}

const enabledFlag = capabilityConfig?.enabled ?? process.env.CAPABILITY_ENABLED ?? "true";
const enabled = String(enabledFlag).toLowerCase() !== "false";
const valueRaw = capabilityConfig?.value ?? process.env.CAPABILITY_VALUE;
const value = valueRaw !== undefined ? BigInt(valueRaw) : enabled ? 1n : 0n;

const min = BigInt(capabilityConfig?.min ?? process.env.CAPABILITY_MIN ?? 0);
const max = BigInt(capabilityConfig?.max ?? process.env.CAPABILITY_MAX ?? 1);
const activationDelay = BigInt(capabilityConfig?.activationDelay ?? process.env.CAPABILITY_ACTIVATION_DELAY ?? 0);
const emergencyExpiry = BigInt(capabilityConfig?.emergencyExpiry ?? process.env.CAPABILITY_EMERGENCY_EXPIRY ?? 0);
const rollbackWindow = BigInt(capabilityConfig?.rollbackWindow ?? process.env.CAPABILITY_ROLLBACK_WINDOW ?? 0);
const hasBoundsFlag = capabilityConfig?.hasBounds ?? process.env.CAPABILITY_HAS_BOUNDS ?? "true";
const hasBounds = String(hasBoundsFlag).toLowerCase() !== "false";

const evidenceHash = normalizeBytes32(
  capabilityConfig?.evidenceHash || process.env.EVIDENCE_HASH || ethers.ZeroHash,
  "evidenceHash"
);

const capabilityKey = normalizeBytes32(capability, "capability");

const registryIface = new ethers.Interface(POLICY_REGISTRY_ABI);
const calls = [];

calls.push({
  target: policyRegistry,
  value: 0n,
  data: registryIface.encodeFunctionData("setPolicySetting", [
    capabilityKey,
    min,
    max,
    Number(activationDelay),
    Number(emergencyExpiry),
    Number(rollbackWindow),
    hasBounds,
    enabled
  ])
});

calls.push({
  target: policyRegistry,
  value: 0n,
  data: registryIface.encodeFunctionData("applyPolicy", [capabilityKey, value, evidenceHash])
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
  capability,
  capabilityKey,
  enabled,
  value: value.toString(),
  settings: {
    min: min.toString(),
    max: max.toString(),
    activationDelay: activationDelay.toString(),
    emergencyExpiry: emergencyExpiry.toString(),
    rollbackWindow: rollbackWindow.toString(),
    hasBounds
  },
  evidenceHash,
  governor: GOVERNOR_ADDRESS || null,
  calls: callBundle,
  executor: executorBundle
};

const json = JSON.stringify(output, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
fs.writeFileSync(OUTPUT_PATH, json);
console.log(`[capability] wrote proposal bundle: ${OUTPUT_PATH}`);
console.log(`[capability] calls: ${calls.length}`);
if (!GOVERNOR_ADDRESS) {
  console.log("[capability] GOVERNOR_ADDRESS not set; calldata emitted only.");
}
