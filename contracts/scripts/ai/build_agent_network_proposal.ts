/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { ghost } from "@ghostchain/sdk";
import {
  EXECUTOR_ABI_FRAGMENTS,
  buildCall,
  buildExecutorCalldata,
  computeGovernorHash,
  computeProposalHash,
  type ExecutorMode
} from "../governance/build_proposal_calldata";

const OUTPUT_PATH =
  process.env.AGENT_PROPOSAL_OUTPUT ||
  path.join(process.cwd(), "contracts", "scripts", "ai", "agent_network_proposal.json");

const POLICY_ADDRESS = process.env.AGENT_POLICY_ADDRESS || "";
const REGISTRY_ADDRESS = process.env.AGENT_REGISTRY_ADDRESS || "";
const EXECUTOR_ADDRESS = process.env.PROPOSAL_EXECUTOR_ADDRESS;
const EXECUTOR_MODE = process.env.PROPOSAL_EXECUTOR_MODE as ExecutorMode | undefined;
const DESCRIPTION = process.env.AGENT_PROPOSAL_DESCRIPTION || "Agent network policy + registry";

const CONFIG_PATH = process.env.AGENT_CONFIG_PATH || "";

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

const loadConfig = () => {
  if (CONFIG_PATH && fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  }

  const role = process.env.AGENT_ROLE || "router";
  const actionList = (process.env.AGENT_ACTIONS || "route.task")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const agentId = process.env.AGENT_ID || "router-1";
  const operator = process.env.AGENT_OPERATOR || "";
  const metadataURI = process.env.AGENT_METADATA_URI || "";
  const policyHash = process.env.AGENT_POLICY_HASH || toBytes32(`policy:${role}`);

  return {
    rolePolicies: [{ role, policyHash, enabled: true }],
    actionPermissions: actionList.map((action) => ({ role, action, allowed: true })),
    agents: operator
      ? [{ agentId, operator, role, policyHash, metadataURI }]
      : []
  };
};

function main() {
  const policy = requireAddress("AGENT_POLICY_ADDRESS", POLICY_ADDRESS);
  const registry = requireAddress("AGENT_REGISTRY_ADDRESS", REGISTRY_ADDRESS);

  const policyAbi = [
    "function setRolePolicy(bytes32 role,bytes32 policyHash,bool enabled) external",
    "function setActionAllowed(bytes32 role,bytes32 action,bool allowed) external"
  ];
  const registryAbi = [
    "function registerAgent(bytes32 agentId,address operator,bytes32 role,bytes32 policyHash,string metadataURI) external"
  ];

  const config = loadConfig();
  const calls = [];

  for (const entry of config.rolePolicies || []) {
    calls.push(
      buildCall(policy, policyAbi, "setRolePolicy", [
        toBytes32(entry.role),
        toBytes32(entry.policyHash),
        Boolean(entry.enabled)
      ])
    );
  }

  for (const entry of config.actionPermissions || []) {
    calls.push(
      buildCall(policy, policyAbi, "setActionAllowed", [
        toBytes32(entry.role),
        toBytes32(entry.action),
        Boolean(entry.allowed)
      ])
    );
  }

  for (const entry of config.agents || []) {
    const operator = requireAddress("AGENT_OPERATOR", entry.operator);
    calls.push(
      buildCall(registry, registryAbi, "registerAgent", [
        toBytes32(entry.agentId),
        operator,
        toBytes32(entry.role),
        toBytes32(entry.policyHash),
        entry.metadataURI || ""
      ])
    );
  }

  if (calls.length === 0) {
    throw new Error("no_calls_generated");
  }

  const payload: Record<string, unknown> = {
    description: DESCRIPTION,
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
  console.log("[agent-network] proposal written:", OUTPUT_PATH);
}

main();
