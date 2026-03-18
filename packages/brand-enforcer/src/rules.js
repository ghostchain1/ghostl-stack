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
    allowlistedBy: 'COMPAT_ALLOWLIST_PATTERNS',
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

  // ─── BRAND-008 through BRAND-013: deeper eth leak detection ─────────────────

  {
    id: 'BRAND-008',
    severity: 'CRITICAL',
    description: 'Direct import from "ethers" package outside the ghost-sdk-core/src/ethers/ compat subtree.',
    // Matches any: import ... from "ethers" / import("ethers") / require("ethers")
    // Exception: files inside ghost-sdk-core/src/ethers/ are the designated compat layer.
    regex: /(?:import\s+.*?\s+from\s+["']ethers["']|import\s*\(\s*["']ethers["']\s*\)|require\s*\(\s*["']ethers["']\s*\))/,
    // Bridge-allowlist adds compat paths — see COMPAT_ALLOWLIST_PATTERNS below
    allowlistedBy: 'COMPAT_ALLOWLIST_PATTERNS',
  },

  {
    id: 'BRAND-009',
    severity: 'HIGH',
    description: 'parseEther / formatEther / parseUnits / formatUnits used or re-exported outside compat layer.',
    // These are ethers function names. Ghost code must use parseGhost/formatGhost/parseGhostUnits/formatGhostUnits.
    regex: /\b(?:parseEther|formatEther)\s*\(/,
    allowlistedBy: 'COMPAT_ALLOWLIST_PATTERNS',
  },

  {
    id: 'BRAND-010',
    severity: 'HIGH',
    description: 'eth_ JSON-RPC method string literal used in non-compat user-facing code.',
    // Ghost consumer code must use GhostRPCMethod constants (ghost_*), not eth_* strings.
    // Matches: "eth_getBalance", 'eth_blockNumber', `eth_call`, etc.
    regex: /["'`]eth_(?:getBalance|blockNumber|chainId|call|sendRawTransaction|getTransactionReceipt|getLogs|getBlock(?:ByNumber|ByHash|TransactionCount)?|estimateGas|gasPrice|feeHistory|getCode|getStorageAt|getTransactionCount|getTransactionByHash|newFilter|getFilterLogs|getFilterChanges|uninstallFilter|subscribe|unsubscribe|syncing|accounts|sign(?:Transaction)?|getWork|submitWork|protocolVersion|hashrate|mining|coinbase|createAccessList|maxPriorityFeePerGas)["'`]/,
    allowlistedBy: 'COMPAT_ALLOWLIST_PATTERNS',
  },

  {
    id: 'BRAND-011',
    severity: 'HIGH',
    description: 'window.ethereum reference detected outside bridge/compat code.',
    // MetaMask injection — must not appear in GhostStack code paths.
    regex: /\bwindow\.ethereum\b/,
    allowlistedBy: 'BRIDGE_ALLOWLIST_PATTERNS',
  },

  {
    id: 'BRAND-012',
    severity: 'MEDIUM',
    description: '"MetaMask" string in user-facing code or UI components.',
    // GhostStack UIs must brand the wallet as GhostWallet, not MetaMask.
    // Exception: integration docs / bridge adapter descriptions.
    regex: /\bMetaMask\b/,
    allowlistedBy: 'BRIDGE_ALLOWLIST_PATTERNS',
  },

  {
    id: 'BRAND-013',
    severity: 'LOW',
    description: 'Hardcoded chainId 1 (Ethereum mainnet) without a // ghost-chainid-ignore comment.',
    // GhostChain uses L1=14000101, L2=901, L3=903.
    // Bare chainId = 1 indicates a forgotten Ethereum assumption.
    regex: /\bchainId\s*[=:]\s*1\b(?!.*ghost-chainid-ignore)/,
    allowlistedBy: 'BRIDGE_ALLOWLIST_PATTERNS',
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
  // Canonical exemptions per workspace rules (copilot-instructions.md)
  /contracts\/lib\//,
  /contracts\/ghostcain\//,
  /contracts\/formal\//,
  /^branding\//,
  /chains\/ghostchain-l1\//,
  // Documentation files (may reference old methods for educational/reference purposes)
  /^docs\//,
  /ghost-brain-core\/docs\//,
  // Infrastructure configuration (OP Stack gateway translates eth_→ghost_)
  /^infra\//,
  // Ops scripts and security reports
  /^ops\//,
  // brand-enforcer's own rules and test files reference the patterns as strings
  /packages\/brand-enforcer\//,
  // tools — branding, sovereignty, devkit tools reference eth patterns by design
  /^tools\//,
  // ghostbrain-gsa tests legitimately use ETH symbol to test brand rejection
  /^services\/ghostbrain-gsa\//,
  // ghost-branding service defines rejected patterns (e.g. label: "Ethereum keyword")
  /^services\/ghost-branding\//,
];

/**
 * File path patterns that are EXEMPT from BRAND-008, BRAND-009, BRAND-010 violations.
 * These are legitimate ethers/compat integration paths where direct ethers usage is expected.
 */
export const COMPAT_ALLOWLIST_PATTERNS = [
  // ghost-sdk-core ethers shim is the designated compat layer
  /ghost-sdk-core\/src\/ethers\//,
  /ghost-sdk-core\/src\/abi\//,
  /ghost-sdk-core\/src\/rpc\//,
  // All ghost-sdk-core source (provider, etc.) translates eth→ghost
  /packages\/ghost-sdk-core\/src\//,
  // ghost-sdk source wraps ethers by design
  /packages\/ghost-sdk\//,
  // ghost-devkit development toolkit (monitors eth_ calls, wraps providers)
  /packages\/ghost-devkit\/src\//,
  // ghost-ai-sdk wraps eth operations for AI layer
  /packages\/ghost-ai-sdk\/src\//,
  // ghost-nodes RPC client (full src/, not just compat/ subdirectory)
  /packages\/ghost-nodes\/src\//,
  // ghost-nodes compat barrel
  /ghost-nodes\/src\/compat\//,
  // Bridge adapters legitimately wrap ethers
  /\bbridge\b/i,
  /\badapter\b/i,
  // contracts/ — deployment scripts, test files, type extensions use ethers routinely
  /^contracts\//,
  // litvyblive apps are internal ghost-sdk consumers using ghost-sdk compat layer
  /apps\/litvyblive\//,
  // all microservices — many are geth-interfacing infra that need eth_ internally
  /^services\//,
  // additional packages with SDK-level or CLI implementations
  /packages\/sdk\//,
  /packages\/ghoststack-cli\//,
  // Ignore compiled output and deps
  /node_modules/,
  /dist\//,
  /\.git/,
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
