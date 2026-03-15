// GhostChain Contracts v5.6.1 (contracts/src/l3/launchpad/CreatorToken.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../../GhostBrand.sol";
import {GRC20} from "../../ghost/GRC20.sol";
import {GhostOwnable} from "../../ghost/GhostOwnable.sol";

/// @title  CreatorToken
/// @notice Fan token launched by a creator on GhostL3 (GRC-20, capped supply).
///         Minting is restricted to a single authorised minter (the TokenSaleEngine).
///         Burning is open to any token holder.  Creator (owner) may pause transfers.
contract CreatorToken is GhostBrand, GRC20, GhostOwnable {
    // ── Errors ────────────────────────────────────────────────────────────────
    error CreatorToken__WrongChain(uint256 expected, uint256 actual);
    error CreatorToken__CapExceeded(uint256 cap, uint256 requested);
    error CreatorToken__NotMinter();
    error CreatorToken__Paused();
    error CreatorToken__ZeroAddress();

    // ── Events ────────────────────────────────────────────────────────────────
    event MinterUpdated(address indexed previous, address indexed next);
    event PauseToggled(bool paused);

    // ── State ─────────────────────────────────────────────────────────────────
    address public immutable CREATOR;
    uint256 public immutable MAX_SUPPLY;

    address public minter;
    bool    public paused;

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @param _name       Human-readable fan token name
    /// @param _symbol     Ticker symbol (e.g. "NOVA")
    /// @param _creator    Creator address — receives ownership
    /// @param _maxSupply  Hard cap on total supply (18-decimal units)
    /// @param _minter     Initial minter, usually the TokenSaleEngine deployer
    constructor(
        string  memory _name,
        string  memory _symbol,
        address        _creator,
        uint256        _maxSupply,
        address        _minter
    )
        GRC20(_name, _symbol, 18)
        GhostOwnable(_creator)
    {
        if (_creator == address(0)) revert CreatorToken__ZeroAddress();
        if (_minter  == address(0)) revert CreatorToken__ZeroAddress();
        CREATOR    = _creator;
        MAX_SUPPLY = _maxSupply;
        minter     = _minter;
    }

    // ── Minting (minter-only, capped) ─────────────────────────────────────────

    /// @notice Mint `amount` tokens to `to`.  Only callable by the authorised minter.
    function mint(address to, uint256 amount) public override {
        if (block.chainid != L3_CHAIN_ID) revert CreatorToken__WrongChain(L3_CHAIN_ID, block.chainid);
        if (msg.sender != minter) revert CreatorToken__NotMinter();
        if (totalSupply + amount > MAX_SUPPLY) revert CreatorToken__CapExceeded(MAX_SUPPLY, totalSupply + amount);
        _mint(to, amount);
    }

    // ── Transfer guard (pause) ────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external override returns (bool) {
        if (paused) revert CreatorToken__Paused();
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        if (paused) revert CreatorToken__Paused();
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "GRC20: allowance exceeded");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    // ── Owner-only admin ──────────────────────────────────────────────────────

    /// @notice Replace the authorised minter (e.g. upgrade the sale engine).
    function setMinter(address _minter) external onlyOwner {
        if (_minter == address(0)) revert CreatorToken__ZeroAddress();
        emit MinterUpdated(minter, _minter);
        minter = _minter;
    }

    /// @notice Toggle transfer pause.  Minting is unaffected.
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseToggled(_paused);
    }
}
