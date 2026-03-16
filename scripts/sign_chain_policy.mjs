/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { ghost } from "@ghostchain/sdk";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROPOSAL_PATH =
  process.env.CHAIN_POLICY_PROPOSAL || path.join(ROOT_DIR, "ops", "governance", "chain-policy-proposal.json");
const OUTPUT_PATH =
  process.env.CHAIN_POLICY_SIGNED_OUT || path.join(ROOT_DIR, "ops", "governance", "chain-policy-signed.json");
const RAW_KEYS =
  process.env.CHAIN_POLICY_SIGNERS || process.env.CHAIN_POLICY_PRIVATE_KEYS || process.env.PRIVATE_KEYS || "";

if (!fs.existsSync(PROPOSAL_PATH)) {
  throw new Error(`missing proposal bundle: ${PROPOSAL_PATH}`);
}
if (!RAW_KEYS) {
  throw new Error("missing CHAIN_POLICY_SIGNERS (comma-separated private keys)");
}

const proposal = JSON.parse(fs.readFileSync(PROPOSAL_PATH, "utf8"));
const keys = RAW_KEYS.split(",").map((entry) => entry.trim()).filter(Boolean);

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
  chainId: Number(proposal.chainId),
  verifyingContract: proposal.executor
};

const update = {
  policyKey: proposal.update.policyKey,
  value: BigInt(proposal.update.value),
  evidenceHash: proposal.update.evidenceHash,
  metadataHash: proposal.update.metadataHash,
  nonce: BigInt(proposal.update.nonce),
  issuedAt: Number(proposal.update.issuedAt),
  validUntil: Number(proposal.update.validUntil),
  emergency: Boolean(proposal.update.emergency)
};

const signatures = [];
for (const key of keys) {
  const wallet = new ghost.Wallet(key);
  const signature = await wallet.signTypedData(domain, types, update);
  signatures.push({ signer: wallet.address, signature });
}

const output = {
  ...proposal,
  signedAt: new Date().toISOString(),
  signatures
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
console.log(`[chain-policy] wrote signed bundle: ${OUTPUT_PATH}`);
console.log(`[chain-policy] signatures: ${signatures.length}`);
