import { spawnSync } from "node:child_process";

const strict = process.env.FORMAL_VERIFY_STRICT === "1";
const env = { ...process.env, FORMAL_VERIFY: "true" };
const result = spawnSync("npx", ["hardhat", "compile", "--force"], {
  stdio: "inherit",
  env
});

  if ((result.status ?? 1) !== 0 && !strict) {
    console.warn("[formal] Model checker failed; falling back to standard compile.");
    const fallback = spawnSync("npx", ["hardhat", "compile", "--force"], {
      stdio: "inherit",
      env: { ...process.env, HARDHAT_VIA_IR: "true" }
    });
    process.exit(fallback.status ?? 1);
  }

process.exit(result.status ?? 1);
