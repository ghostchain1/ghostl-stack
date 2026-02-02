/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import {
  EXECUTOR_ABI_FRAGMENTS,
  buildCall,
  buildExecutorCalldata,
  computeGovernorHash,
  computeProposalHash,
  type ExecutorMode
} from "../governance/build_proposal_calldata";

const OUTPUT_PATH =
  process.env.AI_ACTION_PROPOSAL_OUTPUT ||
  path.join(process.cwd(), "contracts", "scripts", "ai", "ai_action_ratification.json");

const POLICY_ADDRESS = process.env.AI_POLICY_ADDRESS || "";
const EXECUTOR_ADDRESS = process.env.PROPOSAL_EXECUTOR_ADDRESS;
const EXECUTOR_MODE = process.env.PROPOSAL_EXECUTOR_MODE as ExecutorMode | undefined;
const DESCRIPTION = process.env.AI_ACTION_DESCRIPTION || "AI action policy ratification";

const ROLE_INPUT = process.env.AI_POLICY_ROLE || "ghost.ai.commander";
const ACTION_TARGET = process.env.AI_ACTION_TARGET || "";
const ACTION_SELECTOR = process.env.AI_ACTION_SELECTOR || "";
const ACTION_ID = process.env.AI_ACTION_ID || "";

const ENABLED = (process.env.AI_ACTION_ENABLED || "true").toLowerCase() !== "false";
const TIER = Number(process.env.AI_ACTION_TIER || "1");
const COOLDOWN = Number(process.env.AI_ACTION_COOLDOWN_SECONDS || "0");
const APPROVALS = Number(process.env.AI_ACTION_APPROVALS_REQUIRED || "0");
const EVIDENCE_REQUIRED = (process.env.AI_ACTION_EVIDENCE_REQUIRED || "true").toLowerCase() !== "false";
const SCOPE_INPUT = process.env.AI_ACTION_SCOPE || "ghostchain.l1";
const EVIDENCE_HASH = process.env.AI_ACTION_EVIDENCE_HASH || "";

const requireAddress = (name: string, value: string) => {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return ethers.getAddress(value);
};

const toBytes32 = (value: string) => {
  if (ethers.isHexString(value, 32)) return value;
  return ethers.keccak256(ethers.toUtf8Bytes(value));
};

const requireBytes32 = (name: string, value: string) => {
  if (!value || !ethers.isHexString(value, 32)) {
    throw new Error(`missing_or_invalid_${name}`);
  }
  return value;
};

const actionId = () => {
  if (ACTION_ID) return requireBytes32("AI_ACTION_ID", ACTION_ID);
  if (!ethers.isAddress(ACTION_TARGET)) {
    throw new Error("missing_or_invalid_AI_ACTION_TARGET");
  }
  if (!ethers.isHexString(ACTION_SELECTOR, 4)) {
    throw new Error("missing_or_invalid_AI_ACTION_SELECTOR");
  }
  return ethers.keccak256(ethers.solidityPacked(["address", "bytes4"], [ACTION_TARGET, ACTION_SELECTOR]));
};

function main() {
  const policy = requireAddress("AI_POLICY_ADDRESS", POLICY_ADDRESS);
  const role = toBytes32(ROLE_INPUT);
  const action = actionId();
  const scope = toBytes32(SCOPE_INPUT);
  const evidenceHash = requireBytes32("AI_ACTION_EVIDENCE_HASH", EVIDENCE_HASH);

  const policyAbi = [
    "function setActionPolicy(bytes32 role,bytes32 action,bool enabled,uint8 tier,uint64 cooldownSeconds,uint16 approvalsRequired,bool evidenceRequired,bytes32 scope,bytes32 evidenceHash) external"
  ];

  const calls = [
    buildCall(policy, policyAbi, "setActionPolicy", [
      role,
      action,
      ENABLED,
      TIER,
      COOLDOWN,
      APPROVALS,
      EVIDENCE_REQUIRED,
      scope,
      evidenceHash
    ])
  ];

  const payload: Record<string, unknown> = {
    description: DESCRIPTION,
    role,
    action,
    scope,
    evidenceHash,
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
  console.log("[ai-action] proposal written:", OUTPUT_PATH);
}

main();
