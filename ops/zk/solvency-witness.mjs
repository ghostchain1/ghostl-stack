#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const FIELD_MODULUS = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

const usage = () => {
  console.error("Usage: solvency-witness.mjs --snapshot <snapshot.json> --out <input.json>");
};

const args = process.argv.slice(2);
let snapshotPath = "";
let outPath = "";
for (let i = 0; i < args.length; i += 1) {
  const key = args[i];
  const value = args[i + 1];
  if (key === "--snapshot") {
    snapshotPath = value;
    i += 1;
  } else if (key === "--out") {
    outPath = value;
    i += 1;
  } else {
    throw new Error(`unknown argument: ${key}`);
  }
}

if (!snapshotPath || !outPath) {
  usage();
  process.exit(2);
}

const raw = fs.readFileSync(snapshotPath, "utf8");
const snapshot = JSON.parse(raw);

const hexToField = (value) => {
  const hex = String(value || "").replace(/^0x/, "");
  if (!hex) return "0";
  const n = BigInt(`0x${hex}`) % FIELD_MODULUS;
  return n.toString();
};

const input = {
  assetsRoot: hexToField(snapshot.assetsRoot),
  liabilitiesRoot: hexToField(snapshot.liabilitiesRoot),
  assetsSum: BigInt(String(snapshot.assetsTotalWei || "0")).toString(),
  liabilitiesSum: BigInt(String(snapshot.liabilitiesTotalWei || "0")).toString()
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(input, null, 2));
console.log(`solvency_witness_written:${outPath}`);
