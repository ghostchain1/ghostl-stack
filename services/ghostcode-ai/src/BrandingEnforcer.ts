/**
 * BrandingEnforcer — scans source code for non-Ghost naming violations.
 */

const BANNED: Array<{ label: string; test: (line: string) => boolean }> = [
  { label: "ethereum",      test: l => /\bethereum\b/i.test(l) },
  { label: "ethers",        test: l => /\bethers\b/i.test(l) },
  { label: "eth_ RPC",      test: l => /['"`\s]eth_/.test(l) },
  { label: "web3",          test: l => /\bweb3\b/i.test(l) },
  { label: "wei (unit)",    test: l => /\bwei\b/i.test(l) },
  { label: "gwei (unit)",   test: l => /\bgwei\b/i.test(l) },
  { label: "ERC20",         test: l => /\bERC20\b/.test(l) },
  { label: "ERC721",        test: l => /\bERC721\b/.test(l) },
  { label: "ERC1155",       test: l => /\bERC1155\b/.test(l) },
];

export interface BrandViolation {
  line:    number;
  content: string;
  label:   string;
}

export class BrandingEnforcer {
  scan(code: string): BrandViolation[] {
    const violations: BrandViolation[] = [];
    const lines = code.split("\n");
    lines.forEach((line, i) => {
      for (const { label, test } of BANNED) {
        if (test(line)) {
          violations.push({ line: i + 1, content: line.trim(), label });
        }
      }
    });
    return violations;
  }

  enforce(code: string, filePath = "<unknown>"): void {
    const violations = this.scan(code);
    if (violations.length > 0) {
      const details = violations.map(v => `  line ${v.line}: [${v.label}] ${v.content}`).join("\n");
      throw new Error(`GhostCode branding violation in ${filePath}:\n${details}`);
    }
  }

  /** Auto-rewrites common ETH tokens to Ghost equivalents. */
  rewrite(code: string): string {
    return code
      .replace(/\bERC20\b/g, "GRC20")
      .replace(/\bERC721\b/g, "GRC721")
      .replace(/\bERC1155\b/g, "GRC1155")
      .replace(/\beth_/g, "ghost_")
      .replace(/\bweb3\b/gi, "ghostSdk")
      .replace(/\bethers\b/g, "ghostSdk");
  }
}
