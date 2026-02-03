/* eslint-disable no-console */
import crypto from "node:crypto";
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
} from "./build_proposal_calldata";

const repoRoot = path.resolve(__dirname, "..", "..", "..");

const OUTPUT_PATH =
  process.env.AI_CONSTITUTION_PROPOSAL_OUTPUT ||
  path.join(repoRoot, "contracts", "reports", "ai_constitutional_proposal.json");

const DOC_PATH =
  process.env.CONSTITUTION_DOC_PATH ||
  path.join(repoRoot, "docs", "ghostchain", "charter.md");

const DESCRIPTION =
  process.env.CONSTITUTION_DESCRIPTION ||
  "Ratify GhostChain AI Constitutional Proposal v1";

const DEFAULT_STACK_ENV = path.join(repoRoot, "services", "stack.env");
const DEFAULT_REPORT_PATH = path.join(
  repoRoot,
  "contracts",
  "reports",
  "ai_constitutional_proposal_id.json"
);

const loadEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const out: Record<string, string> = {};
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
};

const envFilePath = process.env.STACK_ENV_FILE || DEFAULT_STACK_ENV;
const fileEnv = loadEnvFile(envFilePath);
const readEnv = (key: string) => process.env[key] ?? fileEnv[key];

const readProposalId = () => {
  const raw = readEnv("CONSTITUTION_PROPOSAL_ID");
  if (raw) return raw;
  if (fs.existsSync(DEFAULT_REPORT_PATH)) {
    const payload = JSON.parse(fs.readFileSync(DEFAULT_REPORT_PATH, "utf8"));
    if (payload?.proposalId !== undefined) {
      return String(payload.proposalId);
    }
  }
  return "";
};

const PROPOSAL_ID_RAW = readProposalId();
if (!PROPOSAL_ID_RAW) {
  throw new Error("missing_CONSTITUTION_PROPOSAL_ID");
}
const PROPOSAL_ID = Number(PROPOSAL_ID_RAW);
if (!Number.isFinite(PROPOSAL_ID) || PROPOSAL_ID < 0) {
  throw new Error(`invalid_CONSTITUTION_PROPOSAL_ID:${PROPOSAL_ID_RAW}`);
}

const DEFAULT_DEPLOYMENT_PATH = path.join(
  repoRoot,
  "contracts",
  "reports",
  "ai_constitutional_deployment.json"
);

const resolveProposalAddress = () => {
  const fromEnv = readEnv("AI_CONSTITUTION_PROPOSAL_ADDRESS") || "";
  if (ethers.isAddress(fromEnv)) return fromEnv;
  if (fs.existsSync(DEFAULT_DEPLOYMENT_PATH)) {
    const payload = JSON.parse(fs.readFileSync(DEFAULT_DEPLOYMENT_PATH, "utf8"));
    if (payload?.address && ethers.isAddress(payload.address)) {
      return payload.address;
    }
  }
  return "";
};

const PROPOSAL_ADDRESS = resolveProposalAddress();
if (!ethers.isAddress(PROPOSAL_ADDRESS)) {
  throw new Error("missing_or_invalid_AI_CONSTITUTION_PROPOSAL_ADDRESS");
}

const EXECUTOR_ADDRESS =
  process.env.PROPOSAL_EXECUTOR_ADDRESS || readEnv("AI_CONSTITUTION_EXECUTOR");
const EXECUTOR_MODE = process.env.PROPOSAL_EXECUTOR_MODE as ExecutorMode | undefined;

const readConstitution = () => {
  const text = fs.readFileSync(DOC_PATH, "utf8");
  const sha256 = crypto.createHash("sha256").update(text).digest("hex");
  const keccak = ethers.keccak256(ethers.toUtf8Bytes(text));
  return {
    text,
    sha256: `0x${sha256}`,
    keccak
  };
};

const constitutionDoc = readConstitution();
const constitutionHash = readEnv("CONSTITUTION_HASH") || constitutionDoc.sha256;
if (!ethers.isHexString(constitutionHash, 32)) {
  throw new Error(`invalid_CONSTITUTION_HASH:${constitutionHash}`);
}

const ratifyAbi = [
  "function ratify(uint256 proposalId, bytes32 constitutionHash) external"
];

const call = buildCall(PROPOSAL_ADDRESS, ratifyAbi, "ratify", [
  PROPOSAL_ID,
  constitutionHash
]);

const policyNamespace = ethers.keccak256(
  ethers.toUtf8Bytes("ghost.ai.policy.consensus")
);

const payload: Record<string, unknown> = {
  description: DESCRIPTION,
  proposalId: PROPOSAL_ID,
  constitution: {
    docPath: DOC_PATH,
    sha256: constitutionDoc.sha256,
    keccak256: constitutionDoc.keccak,
    selectedHash: constitutionHash
  },
  policyNamespace,
  ratificationTx: {
    to: call.target,
    value: call.value.toString(),
    data: call.data
  },
  calls: [{ ...call, value: call.value.toString() }],
  generatedAt: new Date().toISOString()
};

if (EXECUTOR_ADDRESS) {
  if (!ethers.isAddress(EXECUTOR_ADDRESS)) {
    throw new Error("invalid_PROPOSAL_EXECUTOR_ADDRESS");
  }
  const execBundle = buildExecutorCalldata(EXECUTOR_ABI_FRAGMENTS, [call], EXECUTOR_MODE);
  payload["executor"] = {
    target: EXECUTOR_ADDRESS,
    mode: execBundle.mode,
    calldata: execBundle.calldata,
    proposalHash: computeProposalHash(EXECUTOR_ADDRESS, execBundle.calldata, DESCRIPTION)
  };
  payload["governorHash"] = computeGovernorHash(
    EXECUTOR_ADDRESS,
    0n,
    execBundle.calldata,
    DESCRIPTION
  );
} else {
  payload["governorHash"] = computeGovernorHash(call.target, call.value, call.data, DESCRIPTION);
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");
console.log("[constitution] proposal written:", OUTPUT_PATH);
