import { spawnSync } from "node:child_process";

const env = { ...process.env, FORMAL_VERIFY: "true" };
const result = spawnSync("npx", ["hardhat", "compile", "--force"], {
  stdio: "inherit",
  env
});

process.exit(result.status ?? 1);
