/**
 * GhostStack Solidity AST Branding Validator.
 * Scans Solidity source files for ERC/eth/ethers references and rejects them.
 *
 * Checks:
 *  - import statements
 *  - contract/interface names
 *  - variable names and token references
 *  - Rejected: ETH, Ethereum, wei, gwei, ethers, ERC20, ERC721, ERC1155
 */
import * as fs   from "fs";
import * as path from "path";

interface Violation {
  file:    string;
  line:    number;
  content: string;
  pattern: string;
}

const BANNED_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "ERC20 reference",     regex: /\bERC20\b/ },
  { label: "ERC721 reference",    regex: /\bERC721\b/ },
  { label: "ERC1155 reference",   regex: /\bERC1155\b/ },
  { label: "Ethereum keyword",    regex: /\bethereum\b/i },
  { label: "ethers import",       regex: /\bethers\b/i },
  { label: "eth_ RPC method",     regex: /['"`]eth_/ },
  { label: "wei unit literal",    regex: /\bwei\b/i },
  { label: "gwei unit literal",   regex: /\bgwei\b/i },
  { label: "OZ ERC import",       regex: /@openzeppelin\/contracts\/token\/ERC/ },
];

export class ASTBrandValidator {
  private violations: Violation[] = [];

  validateFile(filePath: string): Violation[] {
    const source = fs.readFileSync(filePath, "utf8");
    const lines  = source.split("\n");
    const found: Violation[] = [];

    lines.forEach((line, i) => {
      for (const { label, regex } of BANNED_PATTERNS) {
        if (regex.test(line)) {
          found.push({ file: filePath, line: i + 1, content: line.trim(), pattern: label });
        }
      }
    });

    this.violations.push(...found);
    return found;
  }

  validateDirectory(dir: string): Violation[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !["node_modules", ".git", "dist"].includes(entry.name)) {
        this.validateDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".sol")) {
        this.validateFile(fullPath);
      }
    }
    return this.violations;
  }

  report(): void {
    if (this.violations.length === 0) {
      console.log("[PASSED] Solidity AST: No branding violations.");
      return;
    }
    for (const v of this.violations) {
      console.error(`[VIOLATION] ${v.file}:${v.line}  [${v.pattern}]`);
      console.error(`  → ${v.content}`);
    }
    console.error(`\n${this.violations.length} violation(s) found.`);
    process.exit(1);
  }
}

// CLI
if (require.main === module) {
  const dir = process.argv[2] ?? process.cwd();
  const validator = new ASTBrandValidator();
  validator.validateDirectory(dir);
  validator.report();
}
