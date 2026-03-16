#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ghost } from "@ghostchain/sdk";

const INPUT_PATH = process.env.EVIDENCE_PACK_PATH || process.argv[2] || path.join(process.cwd(), "data", "evidence_pack.json");
const SIGNER_ADDRESS = process.env.EVIDENCE_SIGNER_ADDRESS || "";

const stableStringify = (value) => {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const hashOf = (value) => ghost.keccak256(ghost.toUtf8Bytes(stableStringify(value)));

const buildMerkleRoot = (leaves) => {
  if (leaves.length === 0) return ghost.ZeroHash;
  let level = leaves.slice().sort();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      next.push(hashOf([left, right]));
    }
    level = next.sort();
  }
  return level[0];
};

const toSerializable = (value) => {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toSerializable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toSerializable(v)]));
  }
  return value;
};

const verify = () => {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`evidence_pack_missing:${INPUT_PATH}`);
  }
  const pack = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));

  const receipts = pack.receipts || [];
  const governance = pack.governance || { proposals: [], votes: [], queues: [], executions: [] };
  const ai = pack.ai || {};

  const receiptLeaves = receipts.map((r) => hashOf(toSerializable(r)));
  const governanceLeaves = ([] as any[])
    .concat(governance.proposals || [], governance.votes || [], governance.queues || [], governance.executions || [])
    .map((g) => hashOf(toSerializable(g)));

  const receiptsRoot = buildMerkleRoot(receiptLeaves);
  const governanceRoot = buildMerkleRoot(governanceLeaves);
  const aiHash = hashOf(toSerializable(ai));

  if (pack.hashes?.receiptsRoot !== receiptsRoot) {
    throw new Error("receipts_root_mismatch");
  }
  if (pack.hashes?.governanceRoot !== governanceRoot) {
    throw new Error("governance_root_mismatch");
  }
  if (pack.hashes?.aiHash !== aiHash) {
    throw new Error("ai_hash_mismatch");
  }

  const { signature, ...rest } = pack;
  const recomputedPack = { ...rest, hashes: { ...pack.hashes, packHash: "" } };
  const packHash = hashOf(recomputedPack);
  if (pack.hashes?.packHash !== packHash) {
    throw new Error("pack_hash_mismatch");
  }

  if (pack.signature?.signature && SIGNER_ADDRESS) {
    const recovered = ghost.verifyMessage(ghost.getBytes(packHash), pack.signature.signature);
    if (recovered.toLowerCase() !== SIGNER_ADDRESS.toLowerCase()) {
      throw new Error("signature_mismatch");
    }
  }

  console.log("[evidence] verified ok:", INPUT_PATH);
};

try {
  verify();
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
