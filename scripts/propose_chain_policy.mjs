/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { ghost } from "ghost";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CONFIG_PATH =
  process.env.CHAIN_POLICY_CONFIG || path.join(ROOT_DIR, "ops", "governance", "chain-policy-l1.json");
const OUTPUT_PATH =
  process.env.CHAIN_POLICY_OUT || path.join(ROOT_DIR, "ops", "governance", "chain-policy-proposal.json");
const EXECUTOR_ADDRESS = process.env.AI_PROPOSAL_EXECUTOR_ADDRESS;
const CHAIN_ID = Number(process.env.CHAIN_ID || process.env.L1_CHAIN_ID || 0);
const EVIDENCE_KIND = process.env.CHAIN_POLICY_EVIDENCE_KIND || "ghost.evidence.chain_policy";

const EXECUTOR_ABI = [
  "function executePolicyUpdate((bytes32 policyKey,uint256 value,bytes32 evidenceHash,bytes32 metadataHash,uint256 nonce,uint64 issuedAt,uint64 validUntil,bool emergency) update,bytes[] signatures,bytes32 evidenceKind,uint256 proposalId) external returns (bytes32)",
  "function digestUpdate((bytes32 policyKey,uint256 value,bytes32 evidenceHash,bytes32 metadataHash,uint256 nonce,uint64 issuedAt,uint64 validUntil,bool emergency) update) external view returns (bytes32)",
  "function hashUpdate((bytes32 policyKey,uint256 value,bytes32 evidenceHash,bytes32 metadataHash,uint256 nonce,uint64 issuedAt,uint64 validUntil,bool emergency) update) external view returns (bytes32)"
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

const normalizeUint = (value, label) => {
  if (value === null || value === undefined || value === "") {
    throw new Error(`missing_${label}`);
  }
  try {
    return BigInt(value);
  } catch (err) {
    throw new Error(`invalid_${label}:${value}`);
  }
};

if (!fs.existsSync(CONFIG_PATH)) {
  throw new Error(`missing chain policy config: ${CONFIG_PATH}`);
}

const executor = normalizeAddress("AI_PROPOSAL_EXECUTOR_ADDRESS", EXECUTOR_ADDRESS);
if (!CHAIN_ID || Number.isNaN(CHAIN_ID)) {
  throw new Error("missing_or_invalid_CHAIN_ID");
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const update = {
  policyKey: normalizeBytes32(config.policyKey, "policyKey"),
  value: normalizeUint(config.value, "value"),
  evidenceHash: normalizeBytes32(config.evidenceHash || ghost.ZeroHash, "evidenceHash"),
  metadataHash: normalizeBytes32(config.metadataHash || ghost.ZeroHash, "metadataHash"),
  nonce: normalizeUint(config.nonce ?? 0, "nonce"),
  issuedAt: Number(config.issuedAt || Math.floor(Date.now() / 1000)),
  validUntil: Number(config.validUntil || Math.floor(Date.now() / 1000) + 3600),
  emergency: Boolean(config.emergency)
};

const proposalId = Number(config.proposalId || 0);
const iface = new ghost.Interface(EXECUTOR_ABI);
const calldata = iface.encodeFunctionData("executePolicyUpdate", [
  update,
  [],
  normalizeBytes32(EVIDENCE_KIND, "evidenceKind"),
  proposalId
]);

const types = {
  PolicyUpdate: [
    { name: "policyKey", type: "bytes32" },
    { name: "value", type: "uint256" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "metadataHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "issuedAt", type: "uint64" },
    { name: "validUntil", type: "uint64" },
    { name: "emergency", type: "bool" }
  ]
};

const domain = {
  name: "GhostAIProposalExecutor",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: executor
};

const updateHash = ghost.TypedDataEncoder.hashStruct("PolicyUpdate", types, update);
const signingDigest = ghost.TypedDataEncoder.hash(domain, types, update);

const output = {
  createdAt: new Date().toISOString(),
  executor,
  chainId: CHAIN_ID,
  evidenceKind: EVIDENCE_KIND,
  proposalId,
  update,
  updateHash,
  signingDigest,
  calldata
};

fs.writeFileSync(
  OUTPUT_PATH,
  JSON.stringify(output, (_, value) => (typeof value === "bigint" ? value.toString() : value), 2)
);
console.log(`[chain-policy] wrote proposal bundle: ${OUTPUT_PATH}`);
