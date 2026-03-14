/**
 * Ghost Autobuild Script
 *
 * Ties the Autonomous Contract Engine, Forge compile, and test suite together
 * in a single invocable script.
 *
 * Usage:
 *   npx tsx scripts/ghost-autobuild.ts
 *   DRY_RUN=false npx tsx scripts/ghost-autobuild.ts   # write stubs if needed
 *   DRY_RUN=false ABI_SYNC=true npx tsx scripts/ghost-autobuild.ts
 *
 * Steps:
 *   1. Run the Autonomous Contract Engine (audit + optional patch)
 *   2. forge build --skip test
 *   3. forge test --match-path 'test/foundry/GRC*.t.sol'
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function step(label: string, cmd: string, cwd = REPO_ROOT): void {
  process.stdout.write(`\n▶  ${label}\n   $ ${cmd}\n\n`);
  execSync(cmd, { stdio: "inherit", cwd });
}

// ── 1. Autonomous Contract Engine ─────────────────────────────────────────────
step(
  "Autonomous Contract Engine (audit)",
  "npx tsx services/ghost-contract-engine/src/index.ts",
);

// ── 2. Forge build ────────────────────────────────────────────────────────────
step(
  "Forge build (skip tests)",
  "forge build --skip test",
  path.join(REPO_ROOT, "contracts"),
);

// ── 3. GRC token tests ────────────────────────────────────────────────────────
step(
  "Forge test — GRC token suite",
  "forge test --match-path 'test/foundry/GRC*.t.sol' -v",
  path.join(REPO_ROOT, "contracts"),
);

process.stdout.write("\n✔  ghost-autobuild complete.\n");
