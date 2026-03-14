/**
 * Contract Scanner
 *
 * Walks the contracts/src directory and returns all Solidity source files.
 * Skips build outputs, test fixtures, and vendored library directories.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Directories to skip during the scan (relative base-name match). */
const SKIP_DIRS = new Set([
  "lib",
  "out",
  "artifacts",
  "cache",
  "cache-codex",
  "out-codex",
  "node_modules",
  "crytic-export",
  "typechain-types",
]);

export interface ScannedContract {
  /** Absolute path to the .sol file. */
  filePath: string;
  /** Relative path from the scan root (for display). */
  relativePath: string;
  /** Contract/interface/library name inferred from the file name (without extension). */
  baseName: string;
}

/**
 * Recursively walk `root` and return every `.sol` file that is not inside a
 * skipped directory.
 */
export function scanContracts(root: string): ScannedContract[] {
  const results: ScannedContract[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir – skip
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".sol")) {
        const filePath = path.join(dir, entry.name);
        results.push({
          filePath,
          relativePath: path.relative(root, filePath),
          baseName: path.basename(entry.name, ".sol"),
        });
      }
    }
  }

  walk(root);
  return results;
}
