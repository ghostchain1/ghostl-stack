/**
 * forgeRunner.ts — Spawns `forge build --skip test` and returns the result.
 *
 * Only executes when ALLOW_FORGE_EXEC=true is set in the environment.
 * This is a safety gate — forge modifies the filesystem and emits compiler
 * warnings. Never allow it unconditionally in production.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export interface ForgeResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Run `forge build --skip test` in `contractsDir`.
 *
 * @throws Error if ALLOW_FORGE_EXEC is not "true"
 */
export function runForgeBuild(contractsDir: string): ForgeResult {
  if (process.env.ALLOW_FORGE_EXEC !== "true") {
    throw new Error(
      "forge build blocked: set ALLOW_FORGE_EXEC=true to enable on-demand compilation",
    );
  }

  if (!existsSync(contractsDir)) {
    throw new Error(`contracts directory not found: ${contractsDir}`);
  }

  const forgeBin = process.env.FORGE_BIN ?? "forge";
  const t0 = Date.now();

  const result = spawnSync(forgeBin, ["build", "--skip", "test"], {
    cwd: contractsDir,
    encoding: "utf8",
    timeout: 300_000, // 5 min hard cap
  });

  return {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    durationMs: Date.now() - t0,
  };
}
