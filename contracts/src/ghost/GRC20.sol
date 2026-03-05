// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GRC-20 — Ghost Fungible Token Standard
 * @notice GhostChain native fungible token standard.
 *         API-compatible with ERC-20 so existing tooling works unchanged,
 *         while carrying GhostChain branding and event naming.
 * @dev Drop-in replacement for ERC-20. All external interfaces are identical
 *      so bridged tokens and existing frontends need zero changes.
 */
contract GRC20 {
    // ── Storage ──────────────────────────────────────────────────────────────

    string  public name;
    string  public symbol;
    uint8   public immutable decimals;
    uint256 public totalSupply;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ── Events ────────────────────────────────────────────────────────────────

    /// @notice Emitted on every balance-changing transfer, including mint (from=0)
    ///         and burn (to=0).
    event Transfer(address indexed from, address indexed to, uint256 amount);

    /// @notice Emitted when an owner updates a spender allowance.
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name     = _name;
        symbol   = _symbol;
        decimals = _decimals;
    }

    // ── External transfers ───────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external virtual returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external virtual returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "GRC20: allowance exceeded");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "GRC20: transfer to zero address");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "GRC20: insufficient balance");
        unchecked {
            balanceOf[from] = bal - amount;
            balanceOf[to]  += amount;
        }
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "GRC20: mint to zero address");
        totalSupply    += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        uint256 bal = balanceOf[from];
        require(bal >= amount, "GRC20: burn exceeds balance");
        unchecked {
            balanceOf[from] = bal - amount;
            totalSupply    -= amount;
        }
        emit Transfer(from, address(0), amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        allowance[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}
