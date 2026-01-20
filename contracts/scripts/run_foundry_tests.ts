import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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

const forgeArgs = ["test", "--json"];
if (mode === "fuzz") {
  forgeArgs.push("--fuzz-runs", "512");
}
if (mode === "invariant") {
  forgeArgs.push("--match-test", "invariant_");
}

const result = spawnSync("forge", forgeArgs, {
  cwd: root,
  stdio: "pipe",
  env: {
    ...process.env,
    FOUNDRY_FUZZ_SEED: "0x2a",
    FOUNDRY_OUT: foundryOut,
    FOUNDRY_CACHE_PATH: foundryCache
  }
});
if (result.stdout && result.stdout.length) {
  writeFileSync(path.join(reportsDir, "last.json"), result.stdout);
  process.stdout.write(result.stdout);
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
