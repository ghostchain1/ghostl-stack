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
  process.env.AI_MODEL_LOCK_PROPOSAL_OUTPUT ||
  path.join(process.cwd(), "contracts", "scripts", "ai", "ai_model_lock_proposal.json");

const MODEL_LOCK_ADDRESS = process.env.AI_MODEL_LOCK_ADDRESS || "";
const COMMAND_CENTER_ADDRESS = process.env.AI_COMMAND_CENTER_ADDRESS || "";

const EXECUTOR_ADDRESS = process.env.PROPOSAL_EXECUTOR_ADDRESS;
const EXECUTOR_MODE = process.env.PROPOSAL_EXECUTOR_MODE as ExecutorMode | undefined;
const DESCRIPTION = process.env.AI_MODEL_LOCK_DESCRIPTION || "AI model lock update";

const WIRE_COMMAND_CENTER = (process.env.AI_MODEL_LOCK_WIRE_COMMAND_CENTER || "false").toLowerCase() === "true";

const ALLOW_MODELS = (process.env.AI_MODEL_LOCK_ALLOW_MODELS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const DENY_MODELS = (process.env.AI_MODEL_LOCK_DENY_MODELS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const FREEZE_RAW = (process.env.AI_MODEL_LOCK_FROZEN || "").trim();
const FREEZE =
  FREEZE_RAW.length === 0 ? undefined : FREEZE_RAW.toLowerCase() === "true" || FREEZE_RAW === "1";

const EVIDENCE_INPUT = process.env.AI_MODEL_LOCK_EVIDENCE_HASH || "";

const toBytes32 = (value: string) => {
  if (ghost.isHexString(value, 32)) return value;
  return ghost.keccak256(ghost.toUtf8Bytes(value));
};

const requireAddress = (name: string, value: string) => {
  if (!value || !ghost.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return ghost.getAddress(value);
};

const requireEvidence = () => {
  if (!EVIDENCE_INPUT) {
    throw new Error("missing_AI_MODEL_LOCK_EVIDENCE_HASH");
  }
  return toBytes32(EVIDENCE_INPUT);
};

function main() {
  const modelLock = requireAddress("AI_MODEL_LOCK_ADDRESS", MODEL_LOCK_ADDRESS);
  const commandCenter = COMMAND_CENTER_ADDRESS ? requireAddress("AI_COMMAND_CENTER_ADDRESS", COMMAND_CENTER_ADDRESS) : "";

  const evidenceHash = requireEvidence();

  const modelLockAbi = [
    "function setModel(bytes32 modelId,bool allowed,bytes32 evidenceHash) external",
    "function setFrozen(bool frozen,bytes32 evidenceHash) external"
  ];

  const commandCenterAbi = [
    "function setModelLock(address modelLock) external"
  ];

  const calls = [];

  if (WIRE_COMMAND_CENTER) {
    if (!commandCenter) {
      throw new Error("AI_MODEL_LOCK_WIRE_COMMAND_CENTER=true requires AI_COMMAND_CENTER_ADDRESS");
    }
    calls.push(buildCall(commandCenter, commandCenterAbi, "setModelLock", [modelLock]));
  }

  for (const model of ALLOW_MODELS) {
    calls.push(buildCall(modelLock, modelLockAbi, "setModel", [toBytes32(model), true, evidenceHash]));
  }

  for (const model of DENY_MODELS) {
    calls.push(buildCall(modelLock, modelLockAbi, "setModel", [toBytes32(model), false, evidenceHash]));
  }

  if (FREEZE !== undefined) {
    calls.push(buildCall(modelLock, modelLockAbi, "setFrozen", [FREEZE, evidenceHash]));
  }

  if (calls.length === 0) {
    throw new Error("no_calls_generated");
  }

  const payload: Record<string, unknown> = {
    description: DESCRIPTION,
    evidenceHash,
    modelLock,
    wireCommandCenter: WIRE_COMMAND_CENTER,
    calls: calls.map((call) => ({ ...call, value: call.value.toString() })),
    generatedAt: new Date().toISOString()
  };

  if (EXECUTOR_ADDRESS) {
    const executor = requireAddress("PROPOSAL_EXECUTOR_ADDRESS", EXECUTOR_ADDRESS);
    const execBundle = buildExecutorCalldata(EXECUTOR_ABI_FRAGMENTS, calls, EXECUTOR_MODE);
    payload["executor"] = {
      target: executor,
      mode: execBundle.mode,
      calldata: execBundle.calldata,
      proposalHash: computeProposalHash(executor, execBundle.calldata, DESCRIPTION)
    };
  }

  payload["governorHash"] = payload["executor"]
    ? computeGovernorHash(
        (payload["executor"] as any).target,
        0n,
        (payload["executor"] as any).calldata,
        DESCRIPTION
      )
    : computeGovernorHash(calls[0].target, calls[0].value, calls[0].data, DESCRIPTION);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");
  console.log("[ai-model-lock] proposal written:", OUTPUT_PATH);
}

main();

