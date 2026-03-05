/**
 * @file src/rules.js
 * @description Canonical brand rules and violation patterns for GhostChain.
 *
 * Brand Law (non-negotiable):
 *   - Native token NAME  = "Ghost"
 *   - Native token SYMBOL = "GST"
 *   - Native token DECIMALS = 18
 *   - Chain = "GhostChain"
 *   - No "eth", "ETH", "Ether", "Ethereum" in canonical token metadata surfaces
 *
 * Bridge allowlist: ETH/Ether references are permitted ONLY in:
 *   - Bridge adapter contracts (paths matching BRIDGE_ALLOWLIST_PATTERNS)
 *   - Explicitly marked dual-token contexts (bridge docs)
 *   - Test fixtures with "// brand-enforcer-ignore" comments
 */

/** Canonical brand constants */
export const BRAND = Object.freeze({
  name:    'Ghost',
  symbol:  'GST',
  decimals: 18,
  chain:   'GhostChain',
  unit:    'GST_UNIT',
  gstUnit: '1e18',
});

/**
 * Patterns that indicate a FORBIDDEN legacy ETH brand reference.
 * Each entry has: { id, description, regex, severity }
 * All regexes use standard JavaScript regex syntax (no POSIX extensions).
 */
export const VIOLATION_PATTERNS = [
  {
    id: 'BRAND-001',
    severity: 'CRITICAL',
    description: 'Token symbol "ETH" used instead of "GST"',
    // Matches: symbol: "ETH", symbol = "ETH", symbol: ETH (YAML), SYMBOL = 'ETH'
    regex: /\bsymbol\s*[=:]\s*["']ETH["']/i,
  },
  {
    id: 'BRAND-002',
    severity: 'CRITICAL',
    description: 'Token name "Ethereum" used instead of "Ghost"',
    // Matches: tokenName = "Ethereum", token_name: "Ethereum", nativeName = "Ethereum"
    regex: /\b(?:token|native)_?name\s*[=:]\s*["']Ethereum["']/i,
  },
  {
    id: 'BRAND-003',
    severity: 'HIGH',
    description: 'Hardcoded non-18 decimals on a native token context',
    // Matches: nativeDecimals = 6, native_decimals: 7  (not 18)
    regex: /\bnative_?[Dd]ecimals\s*[=:]\s*(?!18\b)\d+/,
  },
  {
    id: 'BRAND-004',
    severity: 'HIGH',
    description: '"ether" keyword used instead of GST_UNIT (indicates ETH-native assumption)',
    // Matches: 1 ether, wei to ether, msg.value to ether)
    regex: /\b(?:1\s+ether|wei\s+to\s+ether|ether\s*\))/,
  },
  {
    id: 'BRAND-005',
    severity: 'MEDIUM',
    description: '"Ethereum" chain name reference in non-bridge context',
    // Matches: chainName: "Ethereum", chain_name = "Ethereum"
    regex: /\bchain_?[Nn]ame\s*[=:]\s*["']Ethereum["']/i,
  },
  {
    id: 'BRAND-006',
    severity: 'MEDIUM',
    description: 'EIP/ERC comment referencing "Ether" denomination in native token context',
    // Matches: native currency is ETH / native token is Ether
    regex: /\bnative\s+(?:currency|token)\s+is\s+["']?(?:ETH|Ether|Ethereum)["']?/i,
  },
  {
    id: 'BRAND-007',
    severity: 'LOW',
    description: 'Raw "GST" string literal used instead of GHOST_SYMBOL constant in Solidity',
    // Catches e.g.:  == "GST"  without a GHOST_SYMBOL reference on the same line
    regex: /==\s*["']GST["'](?!.*GHOST_SYMBOL)/,
  },
];

/**
 * File path patterns that are EXEMPT from brand enforcement.
 * These are legitimate bridge / interop contexts where ETH references are expected.
 */
export const BRIDGE_ALLOWLIST_PATTERNS = [
  /\bbridge\b/i,
  /\bwrapped-eth\b|\bweth\b/i,
  /\bcross-chain\b/i,
  /\badapter\b/i,
  /\/l1-interop\//i,
  /node_modules/,
  /\.git/,
  /dist\//,
  /artifacts\//,
  /cache\//,
  /out\//,
  /CHANGELOG/i,
  // Test fixtures with explicit exemption comment
  /brand-enforcer-ignore/,
];

/**
 * File extensions to scan (inclusive list).
 */
export const SCANNABLE_EXTENSIONS = new Set([
  '.sol', '.ts', '.tsx', '.js', '.mjs', '.cjs',
  '.json', '.yml', '.yaml', '.md',
]);

/**
 * Required canonical presence checks — these strings MUST appear in certain file patterns.
 * Used by validateTokenMetadata().
 */
export const REQUIRED_ANCHORS = [
  {
    id: 'ANCHOR-001',
    description: 'GhostBrand.sol must declare GHOST_SYMBOL = "GST"',
    filePattern: /GhostBrand\.sol$/,
    requiredPattern: /GHOST_SYMBOL.*=.*["']GST["']/,
  },
  {
    id: 'ANCHOR-002',
    description: 'GhostBrand.sol must declare GHOST_NAME = "Ghost"',
    filePattern: /GhostBrand\.sol$/,
    requiredPattern: /GHOST_NAME.*=.*["']Ghost["']/,
  },
  {
    id: 'ANCHOR-003',
    description: 'Brand spec.json must exist with correct values',
    filePattern: /brand\/spec\.json$/,
    requiredPattern: /"symbol"\s*:\s*"GST"/,
  },
];
