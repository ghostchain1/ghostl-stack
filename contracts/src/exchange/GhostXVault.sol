// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/ReentrancyGuard.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// @title  GhostXVault
/// @notice Custodial vault that holds trader balances for the Ghost X order book.
///         Deposits are locked while orders are open; withdrawals release unlocked funds.
contract GhostXVault is ReentrancyGuard {
    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice Address of the authorised order book (set once at construction).
    address public immutable orderBook;

    /// @dev trader => token => total balance (deposited – withdrawn)
    mapping(address => mapping(address => uint256)) public balance;

    /// @dev trader => token => amount locked by open orders
    mapping(address => mapping(address => uint256)) public locked;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Deposited(address indexed trader, address indexed token, uint256 amount);
    event Withdrawn(address indexed trader, address indexed token, uint256 amount);
    event Locked(address indexed trader, address indexed token, uint256 amount);
    event Unlocked(address indexed trader, address indexed token, uint256 amount);
    event Settled(address indexed from, address indexed to, address indexed token, uint256 amount);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error Unauthorized();
    error InsufficientFreeBalance(address trader, address token, uint256 needed, uint256 free);
    error InsufficientLockedBalance(address trader, address token, uint256 needed, uint256 locked_);
    error TransferFailed();
    error ZeroAmount();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address orderBook_) {
        require(orderBook_ != address(0), "vault: zero orderBook");
        orderBook = orderBook_;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOrderBook() {
        if (msg.sender != orderBook) revert Unauthorized();
        _;
    }

    // ─── External – trader facing ─────────────────────────────────────────────

    /// @notice Deposit ERC-20 tokens into the vault.
    function deposit(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        balance[msg.sender][token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    /// @notice Deposit native ETH/GST as the quote token (address(0) sentinel).
    function depositNative() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        balance[msg.sender][address(0)] += msg.value;
        emit Deposited(msg.sender, address(0), msg.value);
    }

    /// @notice Withdraw unlocked tokens.
    function withdraw(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 free = balance[msg.sender][token] - locked[msg.sender][token];
        if (free < amount) revert InsufficientFreeBalance(msg.sender, token, amount, free);
        balance[msg.sender][token] -= amount;
        _pushToken(token, msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    // ─── External – order book only ───────────────────────────────────────────

    /// @notice Lock funds when an order is placed.
    function lock(address trader, address token, uint256 amount) external onlyOrderBook {
        uint256 free = balance[trader][token] - locked[trader][token];
        if (free < amount) revert InsufficientFreeBalance(trader, token, amount, free);
        locked[trader][token] += amount;
        emit Locked(trader, token, amount);
    }

    /// @notice Release locked funds when an order is cancelled or filled.
    function unlock(address trader, address token, uint256 amount) external onlyOrderBook {
        if (locked[trader][token] < amount) revert InsufficientLockedBalance(trader, token, amount, locked[trader][token]);
        locked[trader][token] -= amount;
        emit Unlocked(trader, token, amount);
    }

    /// @notice Atomic settlement: move tokens between two traders.
    ///         Caller must have previously locked the transferred amounts.
    function settle(
        address from,
        address to,
        address token,
        uint256 amount
    ) external onlyOrderBook {
        if (locked[from][token] < amount) revert InsufficientLockedBalance(from, token, amount, locked[from][token]);
        locked[from][token] -= amount;
        balance[from][token] -= amount;
        balance[to][token] += amount;
        emit Settled(from, to, token, amount);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    /// @notice Free (unlocked) balance available for withdrawal or new orders.
    function freeBalance(address trader, address token) external view returns (uint256) {
        return balance[trader][token] - locked[trader][token];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _pushToken(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "native transfer failed");
        } else {
            if (!IERC20(token).transfer(to, amount)) revert TransferFailed();
        }
    }

    receive() external payable {}
}
