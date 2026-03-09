/**
 * Function Auditor + Generator
 *
 * Defines the required function signatures for each GhostStack contract
 * interface (GRC20, GRC721, GRC1155, Governance, Treasury, Bridge).
 *
 * detectMissingFunctions() compares parsed contract function names against
 * the required set and returns only what is genuinely absent.
 *
 * generateFunction() produces a valid, compilable Solidity stub for each
 * missing function — inserting it *before* the final closing brace of the
 * contract, not appending blindly to the end of the file.
 */

import type { ParseResult } from "./ast-parser.js";

// ── Required function sets by contract role ───────────────────────────────────

export const REQUIRED_FUNCTIONS = {
  GRC20: [
    "totalSupply",
    "balanceOf",
    "allowance",
    "transfer",
    "approve",
    "transferFrom",
    "mint",
    "burn",
    "burnFrom",
    "ghostBalance",
    "ghostTransfer",
    "ghostApprove",
    "ghostAllowance",
    "ghostTransferFrom",
  ],
  GRC721: [
    "ownerOf",
    "balanceOf",
    "getApproved",
    "isApprovedForAll",
    "approve",
    "setApprovalForAll",
    "transferFrom",
    "safeTransferFrom",
    "tokenURI",
    "mint",
    "burn",
    "ghostTransferFrom",
    "ghostSafeTransferFrom",
  ],
  GRC1155: [
    "balanceOf",
    "balanceOfBatch",
    "setApprovalForAll",
    "isApprovedForAll",
    "safeTransferFrom",
    "safeBatchTransferFrom",
    "mint",
    "mintBatch",
    "burn",
    "burnBatch",
  ],
  GhostChainGovernor: [
    "propose",
    "castVote",
    "queue",
    "execute",
    "vote",
    "queueProposal",
    "executeProposal",
    "cancelProposal",
  ],
  SovereignTreasuryEngine: [
    "deposit",
    "withdraw",
    "allocateRewards",
    "buybackGST",
    "burnGST",
  ],
  StandardBridge: [
    "lockTokens",
    "unlockTokens",
    "relayMessage",
    "verifyProof",
    "bridgeGST20",
    "finalizeBridgeGST20",
  ],
} as const;

export type ContractRole = keyof typeof REQUIRED_FUNCTIONS;

/**
 * Return only the function names from `required` that are absent in `parsed`.
 * Inheritance is respected: if a function name appears in any contract/interface
 * within the file (including imported base contracts declared inline), it is
 * considered present.
 */
export function detectMissingFunctions(
  parsed: ParseResult,
  required: readonly string[],
): string[] {
  return required.filter((fn) => !parsed.allFunctionNames.has(fn));
}

/**
 * Produce a minimal Solidity function stub for `name`.
 * Stubs are annotated with a `@ghost-engine-generated` tag so automated
 * tooling can filter them and humans can find them quickly.
 *
 * IMPORTANT: These stubs are intentionally non-functional placeholders that
 * will compile without error.  Teams must implement the business logic.
 */
export function generateFunction(name: string): string {
  const stubs: Record<string, string> = {
    totalSupply: `
    /// @notice Returns total token supply. @ghost-engine-generated
    function totalSupply() public view virtual returns (uint256) {
        return 0;
    }`,

    balanceOf: `
    /// @notice Returns token balance for an account. @ghost-engine-generated
    function balanceOf(address account) public view virtual returns (uint256) {
        return _balances[account];
    }`,

    allowance: `
    /// @notice Returns the spending allowance. @ghost-engine-generated
    function allowance(address owner, address spender) public view virtual returns (uint256) {
        return _allowances[owner][spender];
    }`,

    transfer: `
    /// @notice Transfer tokens to recipient. @ghost-engine-generated
    function transfer(address to, uint256 amount) public virtual returns (bool) {
        require(to != address(0), "GCE: zero address");
        require(_balances[msg.sender] >= amount, "GCE: insufficient balance");
        unchecked {
            _balances[msg.sender] -= amount;
            _balances[to] += amount;
        }
        return true;
    }`,

    approve: `
    /// @notice Approve spender to spend tokens. @ghost-engine-generated
    function approve(address spender, uint256 amount) public virtual returns (bool) {
        require(spender != address(0), "GCE: zero address");
        _allowances[msg.sender][spender] = amount;
        return true;
    }`,

    transferFrom: `
    /// @notice Transfer tokens on behalf of owner. @ghost-engine-generated
    function transferFrom(address from, address to, uint256 amount) public virtual returns (bool) {
        require(_allowances[from][msg.sender] >= amount, "GCE: insufficient allowance");
        unchecked { _allowances[from][msg.sender] -= amount; }
        require(_balances[from] >= amount, "GCE: insufficient balance");
        unchecked {
            _balances[from] -= amount;
            _balances[to] += amount;
        }
        return true;
    }`,

    mint: `
    /// @notice Mint new tokens to account. @ghost-engine-generated
    function mint(address to, uint256 amount) public virtual {
        require(to != address(0), "GCE: zero address");
        _balances[to] += amount;
    }`,

    burn: `
    /// @notice Burn caller's tokens. @ghost-engine-generated
    function burn(uint256 amount) public virtual {
        require(_balances[msg.sender] >= amount, "GCE: insufficient balance");
        unchecked { _balances[msg.sender] -= amount; }
    }`,

    burnFrom: `
    /// @notice Burn tokens from an account (with allowance). @ghost-engine-generated
    function burnFrom(address from, uint256 amount) public virtual {
        require(_allowances[from][msg.sender] >= amount, "GCE: insufficient allowance");
        unchecked { _allowances[from][msg.sender] -= amount; }
        require(_balances[from] >= amount, "GCE: insufficient balance");
        unchecked { _balances[from] -= amount; }
    }`,

    ghostBalance: `
    /// @notice GhostChain alias: returns GST balance for account. @ghost-engine-generated
    function ghostBalance(address account) public view virtual returns (uint256) {
        return _balances[account];
    }`,

    ghostTransfer: `
    /// @notice GhostChain alias: transfer GST. @ghost-engine-generated
    function ghostTransfer(address to, uint256 amount) public virtual returns (bool) {
        return transfer(to, amount);
    }`,

    ghostApprove: `
    /// @notice GhostChain alias: approve GST allowance. @ghost-engine-generated
    function ghostApprove(address spender, uint256 amount) public virtual returns (bool) {
        return approve(spender, amount);
    }`,

    ghostAllowance: `
    /// @notice GhostChain alias: GST allowance. @ghost-engine-generated
    function ghostAllowance(address owner, address spender) public view virtual returns (uint256) {
        return allowance(owner, spender);
    }`,

    ghostTransferFrom: `
    /// @notice GhostChain alias: transferFrom for GST. @ghost-engine-generated
    function ghostTransferFrom(address from, address to, uint256 amount) public virtual returns (bool) {
        return transferFrom(from, to, amount);
    }`,

    // GRC721 stubs
    ownerOf: `
    /// @notice Returns owner of token id. @ghost-engine-generated
    function ownerOf(uint256 tokenId) public view virtual returns (address) {
        return _owners[tokenId];
    }`,

    getApproved: `
    /// @notice Returns approved address for token. @ghost-engine-generated
    function getApproved(uint256 tokenId) public view virtual returns (address) {
        return _tokenApprovals[tokenId];
    }`,

    isApprovedForAll: `
    /// @notice Returns operator approval status. @ghost-engine-generated
    function isApprovedForAll(address owner, address operator) public view virtual returns (bool) {
        return _operatorApprovals[owner][operator];
    }`,

    setApprovalForAll: `
    /// @notice Set operator approval. @ghost-engine-generated
    function setApprovalForAll(address operator, bool approved) public virtual {
        _operatorApprovals[msg.sender][operator] = approved;
    }`,

    tokenURI: `
    /// @notice Returns metadata URI for token. @ghost-engine-generated
    function tokenURI(uint256 /*tokenId*/) public view virtual returns (string memory) {
        return "";
    }`,

    ghostSafeTransferFrom: `
    /// @notice GhostChain safe-transfer alias. @ghost-engine-generated
    function ghostSafeTransferFrom(address from, address to, uint256 tokenId) public virtual {
        safeTransferFrom(from, to, tokenId, "");
    }`,

    // GRC1155 stubs
    balanceOfBatch: `
    /// @notice Returns balances for multiple account/id pairs. @ghost-engine-generated
    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        public view virtual returns (uint256[] memory batchBalances)
    {
        require(accounts.length == ids.length, "GCE: length mismatch");
        batchBalances = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; ++i) {
            batchBalances[i] = balanceOf(accounts[i], ids[i]);
        }
    }`,

    safeBatchTransferFrom: `
    /// @notice Batch transfer of multiple token ids. @ghost-engine-generated
    function safeBatchTransferFrom(
        address /*from*/, address /*to*/,
        uint256[] calldata /*ids*/, uint256[] calldata /*amounts*/,
        bytes calldata /*data*/
    ) public virtual {}`,

    mintBatch: `
    /// @notice Mint multiple token ids. @ghost-engine-generated
    function mintBatch(address to, uint256[] calldata ids, uint256[] calldata amounts, bytes calldata data)
        public virtual
    {
        for (uint256 i = 0; i < ids.length; ++i) {
            mint(to, ids[i], amounts[i], data);
        }
    }`,

    burnBatch: `
    /// @notice Burn multiple token ids. @ghost-engine-generated
    function burnBatch(address from, uint256[] calldata ids, uint256[] calldata amounts)
        public virtual
    {
        for (uint256 i = 0; i < ids.length; ++i) {
            burn(from, ids[i], amounts[i]);
        }
    }`,

    // Governance stubs
    vote: `
    /// @notice Cast a vote on proposal id. @ghost-engine-generated
    function vote(uint256 id, bool support) public virtual {
        castVote(id, support);
    }`,

    queueProposal: `
    /// @notice Queue proposal for execution. @ghost-engine-generated
    function queueProposal(uint256 id) public virtual {}`,

    executeProposal: `
    /// @notice Execute a queued proposal. @ghost-engine-generated
    function executeProposal(uint256 id) public virtual {
        execute(id);
    }`,

    cancelProposal: `
    /// @notice Cancel a proposal before execution. @ghost-engine-generated
    function cancelProposal(uint256 id) public virtual {}`,

    // Treasury stubs
    deposit: `
    /// @notice Deposit GST into the treasury. @ghost-engine-generated
    function deposit(uint256 amount) external virtual {}`,

    withdraw: `
    /// @notice Withdraw GST from the treasury. @ghost-engine-generated
    function withdraw(address to, uint256 amount) external virtual {}`,

    allocateRewards: `
    /// @notice Allocate rewards to a target. @ghost-engine-generated
    function allocateRewards(bytes32 layer, address target, uint256 amount) external virtual {}`,

    buybackGST: `
    /// @notice Buy back GST from the open market. @ghost-engine-generated
    function buybackGST(uint256 amount) external virtual {}`,

    burnGST: `
    /// @notice Burn GST held by this contract. @ghost-engine-generated
    function burnGST(uint256 amount) external virtual {}`,

    // Bridge stubs
    lockTokens: `
    /// @notice Lock tokens into bridge escrow (source chain). @ghost-engine-generated
    function lockTokens(
        address localToken, address remoteToken,
        address to, uint256 amount, uint32 minGasLimit
    ) external virtual {}`,

    unlockTokens: `
    /// @notice Release tokens from bridge escrow (destination chain). @ghost-engine-generated
    function unlockTokens(
        address localToken, address remoteToken,
        address from, address to, uint256 amount
    ) external virtual {}`,

    relayMessage: `
    /// @notice Relay an arbitrary message to the remote bridge. @ghost-engine-generated
    function relayMessage(bytes calldata message, uint32 minGasLimit) external virtual {}`,

    verifyProof: `
    /// @notice Verify a bridge proof. @ghost-engine-generated
    function verifyProof(bytes calldata /*proof*/) external pure virtual returns (bool) {
        return true;
    }`,
  };

  if (name in stubs) {
    return stubs[name]!;
  }

  // Generic stub for any unrecognised function name
  return `
    /// @notice Auto-generated stub: ${name}. @ghost-engine-generated
    function ${name}() public virtual {}`;
}

/**
 * Inject `stubs` into `source` immediately before the final closing `}` of
 * the file.  This keeps the Solidity valid — functions always land inside the
 * last contract definition rather than after it.
 *
 * If no closing `}` is found (malformed file) the source is returned
 * unmodified and a warning is printed.
 */
export function injectFunctions(source: string, stubs: string[]): string {
  if (stubs.length === 0) return source;

  const lastBrace = source.lastIndexOf("}");
  if (lastBrace === -1) {
    process.stderr.write("[function-generator] No closing brace found — skipping injection.\n");
    return source;
  }

  const injection = stubs.join("\n");
  return (
    source.slice(0, lastBrace) +
    "\n" +
    injection +
    "\n" +
    source.slice(lastBrace)
  );
}
