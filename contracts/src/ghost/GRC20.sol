// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GRC-20 — Ghost Fungible Token Standard
 * @notice GhostChain native fungible token standard.
 *         Native GhostChain fungible token standard (GRC-20).
 *         while carrying GhostChain branding and event naming.
 * @dev GRC-20 is the Ghost-native fungible token standard, wire-compatible with the
 *      ERC-20 ABI so bridges and existing tooling require zero code changes.
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

    // ── Public mint / burn (virtual — override with access control) ──────────

    /// @notice Mints `amount` tokens to `to`. Must be overridden with access
    ///         control in concrete contracts (e.g. onlyMinter modifier).
    function mint(address to, uint256 amount) public virtual {
        _mint(to, amount);
    }

    /// @notice Burns `amount` tokens from the caller's balance.
    function burn(uint256 amount) public virtual {
        _burn(msg.sender, amount);
    }

    /// @notice Burns `amount` tokens from `from`'s balance. Caller must have sufficient allowance.
    function burnFrom(address from, uint256 amount) public virtual {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "GRC20: burn allowance exceeded");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _burn(from, amount);
    }

    // ── GhostChain-branded aliases ────────────────────────────────────────────
    // Thin aliases so off-chain tooling and bridges can use ghost_ prefixed
    // selectors without any re-implementation risk.

    /// @notice Returns the GST balance of `account`. Alias for `balanceOf`.
    function ghostBalance(address account) external view returns (uint256) {
        return balanceOf[account];
    }

    /// @notice Transfers `amount` GST to `to`. Alias for `transfer`.
    function ghostTransfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        emit GhostTransfer(msg.sender, to, amount);
        return true;
    }

    /// @notice Approves `spender` for `amount` GST. Alias for `approve`.
    function ghostApprove(address spender, uint256 amount) external returns (bool) {
        _approve(msg.sender, spender, amount);
        emit GhostApproval(msg.sender, spender, amount);
        return true;
    }

    /// @notice Returns the allowance of `spender` from `owner`. Alias for `allowance`.
    function ghostAllowance(address owner, address spender) external view returns (uint256) {
        return allowance[owner][spender];
    }

    /// @notice Transfers `amount` GST from `from` to `to`. Alias for `transferFrom`.
    function ghostTransferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "GRC20: allowance exceeded");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        emit GhostTransfer(from, to, amount);
        return true;
    }

    // ── GhostChain-branded events ──────────────────────────────────────────
    // Emitted by ghost* alias functions in addition to the canonical ERC-20
    // compatible Transfer / Approval events so GhostScan can index both.

    event GhostTransfer(address indexed from, address indexed to, uint256 value);
    event GhostApproval(address indexed owner, address indexed spender, uint256 value);
}
