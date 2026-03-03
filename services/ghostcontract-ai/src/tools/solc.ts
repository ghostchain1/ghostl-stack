/**
 * GhostContractAI — solc Tool
 *
 * Queries solc version and validates pragma compatibility.
 */

import { runCmd } from "./foundry.js";

export async function solcVersion(
  solcBin = "solc",
  timeoutMs = 10_000,
): Promise<string> {
  const r = await runCmd(solcBin, ["--version"], process.cwd(), timeoutMs);
  // Parse: "Version: 0.8.24+commit.xxxx"
  const match = r.stdout.match(/Version:\s*([\d.]+)/);
  return match ? match[1] : r.stdout.trim() || "unknown";
}

/**
 * Extract pragma solidity version from source code.
 */
export function parsePragma(source: string): string | null {
  const match = source.match(/pragma\s+solidity\s+([^;]+);/);
  return match ? match[1].trim() : null;
}
