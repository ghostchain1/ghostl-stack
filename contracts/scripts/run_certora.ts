import { spawnSync } from "node:child_process";
import path from "node:path";

if (!process.env.CERTORAKEY) {
  console.error("CERTORAKEY not set; skipping Certora run.");
  process.exit(0);
}

const root = path.resolve(__dirname, "..");
const result = spawnSync("certoraRun", ["formal/certora/certora.conf"], {
  cwd: root,
  stdio: "inherit",
  env: process.env
});
process.exit(result.status ?? 1);
