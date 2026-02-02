import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const mode = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "default";
const root = path.resolve(__dirname, "..");
const reportsDir = path.join(root, "reports", "foundry");
mkdirSync(reportsDir, { recursive: true });
const foundryOut = path.join(root, ".foundry-out-local");
const foundryCache = path.join(root, ".foundry-cache-local");
mkdirSync(foundryOut, { recursive: true });
mkdirSync(foundryCache, { recursive: true });

const pragmaTarget = "pragma solidity ^0.8.24;";
const pragmaRoots = ["src", "compliance", "test", "formal"].map((dir) => path.join(root, dir));
const mismatchFiles: string[] = [];

const shouldSkipDir = (dirName: string) =>
  dirName === "out" || dirName === "cache" || dirName === "artifacts" || dirName === "node_modules";

const collectSolidityFiles = (dir: string): string[] => {
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      results.push(...collectSolidityFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".sol")) {
      results.push(fullPath);
    }
  }
  return results;
};

for (const rootDir of pragmaRoots) {
  for (const file of collectSolidityFiles(rootDir)) {
    const content = readFileSync(file, "utf8");
    const pragmaLine = content
      .split(/\r?\n/)
      .find((line) => line.trim().startsWith("pragma solidity"));
    if (!pragmaLine || pragmaLine.trim() !== pragmaTarget) {
      mismatchFiles.push(path.relative(root, file));
    }
  }
}

if (mismatchFiles.length > 0) {
  console.error("[pragma] Solidity pragma mismatch. Expected:", pragmaTarget);
  for (const file of mismatchFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const forgeArgs = ["test", "--json"];
if (mode === "fuzz") {
  forgeArgs.push("--fuzz-runs", "512");
}
if (mode === "invariant") {
  forgeArgs.push("--match-test", "invariant_");
}

const extractFirstJsonObject = (text: string): string | null => {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let level = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      level += 1;
    } else if (ch === "}") {
      level -= 1;
      if (level === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
};

const result = spawnSync("forge", forgeArgs, {
  cwd: root,
  stdio: "pipe",
  maxBuffer: 50 * 1024 * 1024,
  env: {
    ...process.env,
    FOUNDRY_FUZZ_SEED: "0x2a",
    FOUNDRY_OUT: foundryOut,
    FOUNDRY_CACHE_PATH: foundryCache
  }
});
if (result.stdout && result.stdout.length) {
  const stdoutText = result.stdout.toString();
  const jsonText = extractFirstJsonObject(stdoutText);
  writeFileSync(path.join(reportsDir, "last.json"), jsonText ?? stdoutText);
  process.stdout.write(stdoutText);
}
if (result.stderr && result.stderr.length) {
  process.stderr.write(result.stderr);
}
const summary = {
  mode,
  status: result.status === 0 ? "ok" : "failed",
  exitCode: result.status ?? 1,
  updatedAt: new Date().toISOString()
};
writeFileSync(path.join(reportsDir, "summary.json"), JSON.stringify(summary, null, 2));
process.exit(result.status ?? 1);
