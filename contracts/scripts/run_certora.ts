import { spawnSync } from "node:child_process";
import path from "node:path";

if (!process.env.CERTORAKEY) {
  console.error("CERTORAKEY not set; skipping Certora run.");
  process.exit(0);
}

const root = path.resolve(__dirname, "..");
const check = spawnSync("certoraRun", ["--version"], { stdio: "pipe" });
if (check.error && (check.error as NodeJS.ErrnoException).code === "ENOENT") {
  console.error("[certora] certoraRun not found. Install the Certora CLI (e.g., `pip3 install certora-cli`).");
  process.exit(1);
}
const result = spawnSync("certoraRun", ["formal/certora/certora.conf"], {
  cwd: root,
  stdio: "inherit",
  env: process.env
});
process.exit(result.status ?? 1);
