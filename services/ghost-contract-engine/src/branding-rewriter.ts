/**
 * Branding Rewriter
 *
 * Applies GhostChain branding rules to raw Solidity source code.
 * Rules are applied conservatively — only to identifiers within contract code,
 * not to comments, string literals, SPDX headers, or import paths — to avoid
 * corrupting files.
 *
 * IMPORTANT: This module is a **report-and-flag** tool by default (dry-run).
 * The engine controller opts-in to actual writes via the `apply` parameter.
 * This prevents accidental mass-rewrites of vendored or already-correct code.
 */

export interface BrandingViolation {
  /** The forbidden term that was found. */
  term: string;
  /** Line number (1-based). */
  line: number;
  /** The full line content. */
  lineText: string;
}

/** Terms and their GhostChain replacements (case-sensitive, word-boundary matched). */
const REPLACEMENTS: Array<{ pattern: RegExp; replacement: string; term: string }> = [
  { term: "ERC20",  pattern: /\bERC20\b/g,  replacement: "GRC20"  },
  { term: "ERC721", pattern: /\bERC721\b/g, replacement: "GRC721" },
  { term: "ERC1155",pattern: /\bERC1155\b/g,replacement: "GRC1155"},
  // ENS → GNS (only when used as a standalone token/contract reference)
  { term: "ENS",    pattern: /\bENS\b/g,    replacement: "GNS"    },
];

/**
 * Scan `source` for branding violations and return a list of findings.
 * Lines that are pure comments (`//` or `* `) are skipped to avoid
 * flagging documentation and vendor headers.
 */
export function detectBrandingViolations(
  source: string,
  filePath = "<unknown>",
): BrandingViolation[] {
  const violations: BrandingViolation[] = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trimStart();

    // Skip comment-only lines and SPDX/pragma headers
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("pragma ") ||
      trimmed.startsWith("SPDX")
    ) {
      continue;
    }

    for (const { pattern, term } of REPLACEMENTS) {
      // Reset lastIndex on each line (patterns have /g flag)
      pattern.lastIndex = 0;
      if (pattern.test(raw)) {
        violations.push({ term, line: i + 1, lineText: raw.trimEnd() });
      }
    }
  }

  if (violations.length > 0) {
    process.stderr.write(
      `[branding-rewriter] ${violations.length} violation(s) in ${filePath}\n`,
    );
  }

  return violations;
}

/**
 * Apply branding replacements to `source`.  Only non-comment lines are
 * modified; import paths and string literals are preserved unchanged.
 *
 * Returns the rewritten source.
 */
export function applyBrandingRewrites(source: string): string {
  const lines = source.split("\n");

  const rewritten = lines.map((raw) => {
    const trimmed = raw.trimStart();

    // Do not touch comments, pragma, SPDX, or import statements
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("pragma ") ||
      trimmed.startsWith("SPDX") ||
      trimmed.startsWith("import ")
    ) {
      return raw;
    }

    let result = raw;
    for (const { pattern, replacement } of REPLACEMENTS) {
      pattern.lastIndex = 0;
      result = result.replace(pattern, replacement);
    }
    return result;
  });

  return rewritten.join("\n");
}
