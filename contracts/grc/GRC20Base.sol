// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IGRC20.sol";

/**
 * @title GRC20Base
 * @notice Reference implementation of the GRC20 token standard.
 * @dev Replaces OpenZeppelin ERC20. Use this as the base for all GST-ecosystem tokens.
 */
abstract contract GRC20Base is IGRC20 {
    string private _name;
    string private _symbol;
    uint8  private _decimals;

    uint256 private _totalSupply;
    mapping(address => uint256)                     private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        _name     = name_;
        _symbol   = symbol_;
        _decimals = decimals_;
    }

    function name()        external view override returns (string memory) { return _name; }
    function symbol()      external view override returns (string memory) { return _symbol; }
    function decimals()    external view override returns (uint8)         { return _decimals; }
    function totalSupply() external view override returns (uint256)       { return _totalSupply; }

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    function allowance(address owner, address spender) external view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 current = _allowances[from][msg.sender];
        require(current >= amount, "GRC20: insufficient allowance");
        _approve(from, msg.sender, current - amount);
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "GRC20: transfer from zero address");
        require(to   != address(0), "GRC20: transfer to zero address");
        require(_balances[from] >= amount, "GRC20: insufficient balance");
        _balances[from] -= amount;
        _balances[to]   += amount;
        emit GhostTransfer(from, to, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner   != address(0), "GRC20: approve from zero address");
        require(spender != address(0), "GRC20: approve to zero address");
        _allowances[owner][spender] = amount;
        emit GhostApproval(owner, spender, amount);
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "GRC20: mint to zero address");
        _totalSupply    += amount;
        _balances[to]   += amount;
        emit GhostTransfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        require(from != address(0), "GRC20: burn from zero address");
        require(_balances[from] >= amount, "GRC20: burn exceeds balance");
        _balances[from] -= amount;
        _totalSupply    -= amount;
        emit GhostTransfer(from, address(0), amount);
    }
}
