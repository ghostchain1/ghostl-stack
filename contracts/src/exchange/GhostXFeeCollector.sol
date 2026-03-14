// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGhostXStaking {
    function depositRewards(uint256 amount) external;
}

interface IGST20Sweep {
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @title  GhostXFeeCollector
/// @notice Accumulates trading fees collected by GhostXOrderBook.
///         Fees are recorded as accounting entries; the owner can
///         sweep them to a treasury or distribute to stakers.
contract GhostXFeeCollector {
    // ─── State ────────────────────────────────────────────────────────────────

    address public owner;
    address public orderBook;
    address public stakingContract;

    /// @dev token => total fees accumulated (accounting only; tokens held by vault).
    mapping(address => uint256) public accumulatedFees;

    /// @dev Sweeper address that can call sweep().
    address public sweeper;

    // Events for staking
    event StakingContractSet(address indexed staking);
    event FeesRoutedToStaking(address indexed token, uint256 amount);

    // ─── Events ───────────────────────────────────────────────────────────────

    event FeeRecorded(address indexed token, uint256 amount, address indexed payer);
    event FeeSwept(address indexed token, uint256 amount, address indexed to);
    event OrderBookUpdated(address indexed oldBook, address indexed newBook);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAmount();
    error ZeroAddress();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address sweeper_) {
        require(sweeper_ != address(0), "fee: zero sweeper");
        owner    = msg.sender;
        sweeper  = sweeper_;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOrderBook() {
        if (msg.sender != orderBook) revert Unauthorized();
        _;
    }

    // ─── Configuration ────────────────────────────────────────────────────────

    function setOrderBook(address book) external onlyOwner {
        if (book == address(0)) revert ZeroAddress();
        emit OrderBookUpdated(orderBook, book);
        orderBook = book;
    }

    function setSweeper(address sw) external onlyOwner {
        if (sw == address(0)) revert ZeroAddress();
        sweeper = sw;
    }

    function setStakingContract(address staking) external onlyOwner {
        if (staking == address(0)) revert ZeroAddress();
        stakingContract = staking;
        emit StakingContractSet(staking);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    // ─── Called by order book ─────────────────────────────────────────────────

    /// @notice Record a fee.  The actual tokens remain in the vault;
    ///         this is a pure accounting call for transparency.
    function recordFee(address token, uint256 amount, address payer) external onlyOrderBook {
        if (amount == 0) revert ZeroAmount();
        accumulatedFees[token] += amount;
        emit FeeRecorded(token, amount, payer);
    }

    // ─── Sweep (sweeper only) ──────────────────────────────────────────────────

    /// @notice Sweep accumulated fees to `to`.  Must be called after
    ///         the vault has physically transferred the tokens here.
    function sweep(address token, uint256 amount, address to) external {
        if (msg.sender != sweeper && msg.sender != owner) revert Unauthorized();
        require(to != address(0), "fee: zero to");
        require(accumulatedFees[token] >= amount, "fee: insufficient");
        accumulatedFees[token] -= amount;
        emit FeeSwept(token, amount, to);
        // Actual token push handled externally (vault → this → treasury).
    }

    /// @notice Route a portion of accumulated fees directly to the staking reward pool.
    ///         The fee collector must physically hold the token balance (swept from vault first).
    function sweepToStaking(address token, uint256 amount) external {
        if (msg.sender != sweeper && msg.sender != owner) revert Unauthorized();
        require(stakingContract != address(0), "fee: no staking");
        require(accumulatedFees[token] >= amount, "fee: insufficient");
        accumulatedFees[token] -= amount;
        // Approve then call depositRewards on the staking contract.
        IGST20Sweep(token).approve(stakingContract, amount);
        IGhostXStaking(stakingContract).depositRewards(amount);
        emit FeesRoutedToStaking(token, amount);
    }
}
