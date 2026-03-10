// GhostChain Contracts v5.6.1 (interchain-bridge/contracts/WrappedGhostAsset.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// NOTE: When moved into contracts/src/, replace this inline block with:
//   import { GhostBrand } from "../GhostBrand.sol";
//   import { GRC20 } from "../ghost/GRC20.sol";

/**
 * @title WrappedGhostAsset
 * @notice GRC-20 wrapped representation of a GhostChain-originated asset minted
 *         on a destination chain after a cross-chain lock is confirmed.
 *
 * Access control:
 *   Minting:   restricted to addresses in `minters` (set by owner/bridge).
 *   Burning:   any token holder can burn their own balance (for return bridges).
 *   Ownership: standard two-step pattern — `proposeOwner` + `acceptOwnership`.
 *
 * ERC-20 / GRC-20 ABI compatibility:
 *   Implements the standard transfer / approve / transferFrom surface so wallets
 *   and tooling require no changes.  Wire-compatible with ERC-20.
 *
 * Bridge invariant:
 *   totalSupply on destination ≤ total locked on GhostChain at any time.
 *   Enforced socially by the validator quorum; the contract itself cannot
 *   verify the remote state directly.
 *
 * Gas token denomination: GST (same 18-decimal base unit as native GST).
 */
contract WrappedGhostAsset {
    // ─── GhostBrand Constants (inlined; replace with import in contracts/src/) ──

    uint8   internal constant GHOST_DECIMALS = 18;
    string  internal constant GHOST_SYMBOL   = "GST";

    // ─── GRC-20 Storage ───────────────────────────────────────────────────────

    string  public name;
    string  public symbol;
    uint8   public immutable DECIMALS;
    uint256 public totalSupply;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ─── Access Control ───────────────────────────────────────────────────────

    address public owner;
    address public pendingOwner;

    mapping(address => bool) public minters;

    // ─── Events ──────────────────────────────────────────────────────────────

    /// @dev Standard GRC-20 events (ERC-20 ABI compatible).
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner_, address indexed spender, uint256 amount);

    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event OwnershipProposed(address indexed proposed);
    event OwnershipAccepted(address indexed newOwner);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error NotMinter();
    error NotPendingOwner();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance();
    error InsufficientAllowance();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    modifier onlyMinter() {
        _onlyMinter();
        _;
    }

    function _onlyOwner() internal view {
        if (msg.sender != owner) revert NotOwner();
    }

    function _onlyMinter() internal view {
        if (!minters[msg.sender]) revert NotMinter();
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(string memory _name, string memory _symbol) {
        name     = _name;
        symbol   = _symbol;
        DECIMALS = GHOST_DECIMALS;
        owner    = msg.sender;
    }

    // ─── Owner admin ──────────────────────────────────────────────────────────

    function proposeOwner(address proposed) external onlyOwner {
        if (proposed == address(0)) revert ZeroAddress();
        pendingOwner = proposed;
        emit OwnershipProposed(proposed);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        owner        = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipAccepted(owner);
    }

    function addMinter(address minter) external onlyOwner {
        if (minter == address(0)) revert ZeroAddress();
        minters[minter] = true;
        emit MinterAdded(minter);
    }

    function removeMinter(address minter) external onlyOwner {
        minters[minter] = false;
        emit MinterRemoved(minter);
    }

    // ─── Minting / Burning ───────────────────────────────────────────────────

    /**
     * @notice Mint wrapped tokens to `recipient`.
     * @dev    Called by the bridge after an inbound lock is confirmed by quorum.
     *         Only authorised minters (bridge contracts) may call this.
     */
    function mint(address recipient, uint256 amount) external onlyMinter {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0)             revert ZeroAmount();
        totalSupply         += amount;
        balanceOf[recipient] += amount;
        emit Transfer(address(0), recipient, amount);
    }

    /**
     * @notice Burn `amount` from the caller's balance.
     * @dev    Called by users initiating a return-bridge (wrapped → native).
     *         After the burn the off-chain relayer picks up the `Transfer(to=0)`
     *         event and initiates an unlock on GhostChain.
     */
    function burn(uint256 amount) external {
        if (amount == 0)                    revert ZeroAmount();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        balanceOf[msg.sender] -= amount;
        totalSupply            -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    // ─── GRC-20 Transfers ─────────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert InsufficientAllowance();
        if (allowed != type(uint256).max) allowance[from][msg.sender] -= amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0))             revert ZeroAddress();
        if (balanceOf[from] < amount)     revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function decimals() external pure returns (uint8) {
        return GHOST_DECIMALS;
    }
}
