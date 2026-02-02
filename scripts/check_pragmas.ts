import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const repoRoot = path.basename(cwd) === "contracts" ? path.resolve(cwd, "..") : cwd;
const pragmaTarget = "pragma solidity ^0.8.24;";
const scanRoots = [
  path.join(repoRoot, "contracts", "src"),
  path.join(repoRoot, "contracts", "compliance"),
  path.join(repoRoot, "contracts", "test"),
  path.join(repoRoot, "contracts", "formal")
];

const ignoreDirs = new Set([
  "node_modules",
  "out",
  "out-codex",
  "cache",
  "cache-codex",
  "artifacts",
  ".hardhat-cache",
  ".foundry-out",
  "reports"
]);

type Mismatch = { file: string; reason: string };
const mismatches: Mismatch[] = [];

const collectSolFiles = (dir: string, results: string[] = []): string[] => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const entryName = entry.name.toString();
    const fullPath = path.join(dir, entryName);
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entryName)) continue;
      collectSolFiles(fullPath, results);
      continue;
    }
    if (entry.isFile() && entryName.endsWith(".sol")) {
      results.push(fullPath);
    }
  }
  return results;
};

for (const rootDir of scanRoots) {
  const files = collectSolFiles(rootDir);
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const pragmaLines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("pragma solidity"));
    if (pragmaLines.length === 0) {
      mismatches.push({ file, reason: "missing pragma" });
      continue;
    }
    if (pragmaLines.length > 1) {
      mismatches.push({ file, reason: `multiple pragmas (${pragmaLines.join(", ")})` });
      continue;
    }
    if (pragmaLines[0] !== pragmaTarget) {
      mismatches.push({ file, reason: `found "${pragmaLines[0]}"` });
    }
  }
}

if (mismatches.length > 0) {
  console.error(`[pragma] Expected "${pragmaTarget}" in all Solidity files.`);
  for (const mismatch of mismatches) {
    console.error(`- ${path.relative(repoRoot, mismatch.file)}: ${mismatch.reason}`);
  }
  process.exit(1);
}

console.log(`[pragma] OK: ${pragmaTarget}`);
