/**
 * ABI Synchronizer
 *
 * Reads Forge build artifacts from contracts/out/<ContractName>.sol/<ContractName>.json
 * and writes a stripped ABI copy into contracts/deployments/abi/ so downstream
 * tooling (SDK, tests, scripts) always has a single source of truth.
 *
 * Does NOT touch contracts/out/ directly — Forge owns that directory.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface ForgeArtifact {
  abi: unknown[];
  bytecode?: { object?: string };
  deployedBytecode?: { object?: string };
}

/**
 * Read the Forge artifact for `contractName` from `outDir` and return the ABI
 * array. Returns `null` if the artifact file is missing or malformed.
 */
export function readForgeABI(
  contractName: string,
  outDir: string,
): unknown[] | null {
  // Forge places artifacts at out/<File.sol>/<ContractName>.json
  // Walk outDir looking for the matching artifact.
  const candidate = path.join(outDir, `${contractName}.sol`, `${contractName}.json`);
  if (!fs.existsSync(candidate)) return null;

  try {
    const raw = fs.readFileSync(candidate, "utf8");
    const obj = JSON.parse(raw) as ForgeArtifact;
    if (!Array.isArray(obj.abi)) return null;
    return obj.abi;
  } catch {
    return null;
  }
}

/**
 * Write `abi` as a JSON file at `<destDir>/<contractName>.json`.
 * Creates `destDir` if it does not exist.
 */
export function syncABI(
  contractName: string,
  abi: unknown[],
  destDir: string,
): void {
  fs.mkdirSync(destDir, { recursive: true });
  const outPath = path.join(destDir, `${contractName}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ contractName, abi }, null, 2) + "\n");
}

/**
 * Convenience function: read the Forge artifact for `contractName` and, if
 * found, write it to `destDir`.  Returns true on success.
 */
export function syncABIFromForge(
  contractName: string,
  outDir: string,
  destDir: string,
): boolean {
  const abi = readForgeABI(contractName, outDir);
  if (abi === null) return false;
  syncABI(contractName, abi, destDir);
  return true;
}
