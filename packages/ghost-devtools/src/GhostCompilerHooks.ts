/**
 * GhostCompilerHooks — Solidity compile hooks that enforce Ghost branding
 * before any contract is compiled.
 */
import * as fs from "fs";
import * as path from "path";

const BANNED_PATTERNS = [
  /\bimport\s+["']@openzeppelin\/contracts\/token\/ERC/,
  /\bERC20\b/,
  /\bERC721\b/,
  /\bERC1155\b/,
  /\berc20\b/i,
  /\bweiToGwei\b/,
  /\bethers\b/i,
];

export class GhostCompilerHooks {
  static validateFile(filePath: string): void {
    const source = fs.readFileSync(filePath, "utf8");
    for (const pattern of BANNED_PATTERNS) {
      if (pattern.test(source)) {
        throw new Error(
          `GhostCompilerHooks: branding violation in ${filePath} — pattern '${pattern.source}' found. ` +
          `Use GRC20/GRC721/GRC1155 instead.`
        );
      }
    }
  }

  static validateDirectory(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !["node_modules", ".git", "dist"].includes(entry.name)) {
        this.validateDirectory(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith(".sol") || entry.name.endsWith(".ts"))) {
        this.validateFile(fullPath);
      }
    }
  }
}
