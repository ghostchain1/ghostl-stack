// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GRC20.sol";

/**
 * @title GhostToken — Ghost Settlement Token (GST)
 * @notice The canonical GST token implementation used across all GhostChain
 *         layers (L1, L2, L3).  GST is GRC-20 compliant.
 *
 *         Token economics:
 *           - Name:     Ghost Settlement Token
 *           - Symbol:   GST
 *           - Decimals: 18
 *           - Supply:   Controlled by owner (mintable / burnable)
 *
 * @dev Inherits GRC20 and adds:
 *       - onlyOwner minting + burning
 *       - layer metadata (chainLayer field)
 *       - pausable transfers (guardian pattern)
 */
contract GhostToken is GRC20 {
    // ── State ─────────────────────────────────────────────────────────────────

    address public owner;
    bool    public paused;

    /// @notice Chain layer this deployment lives on (1 = L1, 2 = L2, 3 = L3).
    uint8 public immutable chainLayer;

    // ── Events ────────────────────────────────────────────────────────────────

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address account);
    event Unpaused(address account);

    // ── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "GST: not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "GST: transfers paused");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _owner      Initial contract owner (treasury / deployer).
     * @param _chainLayer 1 for L1, 2 for L2, 3 for L3.
     * @param initialSupply Amount of GST minted to _owner at deploy time.
     */
    constructor(
        address _owner,
        uint8   _chainLayer,
        uint256 initialSupply
    ) GRC20("Ghost Settlement Token", "GST", 18) {
        require(_owner != address(0), "GST: zero owner");
        require(_chainLayer >= 1 && _chainLayer <= 3, "GST: invalid layer");

        owner      = _owner;
        chainLayer = _chainLayer;

        if (initialSupply > 0) {
            _mint(_owner, initialSupply);
        }
    }

    // ── Owner actions ────────────────────────────────────────────────────────

    /// @notice Mint new GST to `to`. Only callable by owner.
    function mint(address to, uint256 amount) public override onlyOwner {
        _mint(to, amount);
    }

    /// @notice Burn GST from `from`. Only callable by owner (e.g. bridge burn).
    function burnFrom(address from, uint256 amount) public override onlyOwner {
        _burn(from, amount);
    }

    /// @notice Burn caller's own GST.
    function burn(uint256 amount) public override {
        _burn(msg.sender, amount);
    }

    /// @notice Pause all transfers.
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Unpause transfers.
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Transfer ownership.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "GST: zero new owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── Overridden transfer (adds pause guard) ───────────────────────────────

    function transfer(address to, uint256 amount)
        external
        override
        whenNotPaused
        returns (bool)
    {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        override
        whenNotPaused
        returns (bool)
    {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "GRC20: allowance exceeded");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }
}
