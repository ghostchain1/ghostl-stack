// GhostChain Contracts v5.6.1 (liquidity/GhostLiquidStaking.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";

/// @title GhostLiquidStaking
/// @notice Liquid staking protocol for GhostChain GST.
///
///         Users deposit GST and receive gsGST (Ghost Staked GST) — a rebasing
///         liquid staking token representing their proportional share of the
///         staking pool plus accumulated validator rewards.
///
///         Architecture:
///           • gsGST is always redeemable 1:gsGST = (totalPooled / totalShares) GST.
///           • The exchange rate appreciates over time as rewards accrue.
///           • gsGST is transferable and can be used in DeFi (GhostXchange, lending).
///           • Withdrawal queue: unstaking requires a cooling period (UNSTAKE_DELAY).
///           • Node operators (validators) are registered and receive an operator fee.
///
///         gsGST follows the GRC-20 interface so it composes with GhostXchange and LGE.
contract GhostLiquidStaking is GhostBrand, ReentrancyGuard {
    // ─── Constants ────────────────────────────────────────────────────────────
    uint256 public constant UNSTAKE_DELAY        = 7 days;
    uint256 public constant OPERATOR_FEE_BPS     = 500;   // 5% of rewards to operators
    uint256 public constant PROTOCOL_FEE_BPS     = 100;   // 1% to treasury
    uint256 public constant MAX_OPERATORS        = 100;
    uint256 public constant MIN_DEPOSIT          = 10_000_000_000_000_000; // 0.01 GST (1e16 wei)

    // ─── Types ───────────────────────────────────────────────────────────────
    struct WithdrawalRequest {
        uint256 gstAmount;
        uint64  unlocksAt;
        bool    claimed;
    }

    struct Operator {
        address addr;
        uint256 delegated; // GST delegated to this operator
        uint256 totalRewards;
        bool    active;
    }

    // ─── gsGST token state ────────────────────────────────────────────────────
    string  public constant TOKEN_NAME     = "Ghost Staked GST";
    string  public constant TOKEN_SYMBOL   = "gsGST";
    uint8   public constant TOKEN_DECIMALS = 18;

    uint256 public totalShares;
    uint256 public totalPooledGST;

    mapping(address => uint256)                     public shares;
    mapping(address => mapping(address => uint256)) public allowance;

    // ─── Protocol state ───────────────────────────────────────────────────────
    address public immutable TREASURY;
    address public           GOVERNANCE;
    bool    public           depositsPaused;

    Operator[] public operators;
    mapping(address => uint256) public operatorIndex; // addr → 1-based index

    /// Withdrawal queue: user → list of requests
    mapping(address => WithdrawalRequest[]) public withdrawalQueue;

    // ─── Events ──────────────────────────────────────────────────────────────
    event Deposit(address indexed user, uint256 gstDeposited, uint256 sharesIssued);
    event WithdrawalRequested(address indexed user, uint256 sharesRedeemed, uint256 gstAmount, uint64 unlocksAt);
    event WithdrawalClaimed(address indexed user, uint256 gstAmount, uint256 requestIndex);
    event RewardReceived(uint256 gstAmount, uint256 operatorCut, uint256 treasuryCut);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);

    // gsGST GRC-20 events
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error DepositsPaused();
    error BelowMinDeposit();
    error InsufficientShares();
    error NotGovernance();
    error RequestNotReady();
    error AlreadyClaimed();
    error OperatorAlreadyExists();
    error OperatorNotFound();
    error TooManyOperators();

    // ─── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyGovernance() {
        _onlyGovernance();
        _;
    }

    function _onlyGovernance() internal view {
        if (msg.sender != GOVERNANCE) revert NotGovernance();
    }

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(address treasury_, address governance_) {
        require(treasury_   != address(0), "treasury=0");
        require(governance_ != address(0), "gov=0");
        TREASURY   = treasury_;
        GOVERNANCE = governance_;
    }

    // ─── Staking: deposit ─────────────────────────────────────────────────────
    /// @notice Stake GST and receive gsGST shares.
    function stake() external payable nonReentrant returns (uint256 sharesIssued) {
        if (depositsPaused)             revert DepositsPaused();
        if (msg.value < MIN_DEPOSIT)    revert BelowMinDeposit();

        sharesIssued = _gstToShares(msg.value);
        shares[msg.sender] += sharesIssued;
        totalShares        += sharesIssued;
        totalPooledGST     += msg.value;

        emit Transfer(address(0), msg.sender, sharesIssued);
        emit Deposit(msg.sender, msg.value, sharesIssued);
    }

    // ─── Staking: unstake request ─────────────────────────────────────────────
    /// @notice Request unstaking of `shareAmount` gsGST. Starts the cooldown period.
    function requestUnstake(uint256 shareAmount) external nonReentrant returns (uint256 idx) {
        if (shares[msg.sender] < shareAmount) revert InsufficientShares();

        uint256 gstAmount = _sharesToGST(shareAmount);
        shares[msg.sender] -= shareAmount;
        totalShares        -= shareAmount;
        totalPooledGST     -= gstAmount;

        require(block.timestamp <= type(uint64).max, "ts overflow");
        uint64 unlocksAt = uint64(block.timestamp + UNSTAKE_DELAY);
        idx = withdrawalQueue[msg.sender].length;
        withdrawalQueue[msg.sender].push(WithdrawalRequest({
            gstAmount:  gstAmount,
            unlocksAt:  unlocksAt,
            claimed:    false
        }));

        emit Transfer(msg.sender, address(0), shareAmount);
        emit WithdrawalRequested(msg.sender, shareAmount, gstAmount, unlocksAt);
    }

    /// @notice Claim a matured withdrawal request.
    function claimUnstake(uint256 requestIndex) external nonReentrant {
        WithdrawalRequest storage req = withdrawalQueue[msg.sender][requestIndex];
        if (block.timestamp < req.unlocksAt) revert RequestNotReady();
        if (req.claimed)                     revert AlreadyClaimed();
        req.claimed = true;
        uint256 gst = req.gstAmount;
        (bool ok,) = msg.sender.call{value: gst}("");
        require(ok, "gsGST: GST transfer failed");
        emit WithdrawalClaimed(msg.sender, gst, requestIndex);
    }

    // ─── gsGST GRC-20 interface ───────────────────────────────────────────────
    function name()        external pure returns (string memory) { return TOKEN_NAME;     }
    function symbol()      external pure returns (string memory) { return TOKEN_SYMBOL;   }
    function decimals()    external pure returns (uint8)          { return TOKEN_DECIMALS; }
    function totalSupply() external view returns (uint256)        { return totalShares;    }
    function balanceOf(address account) external view returns (uint256) { return shares[account]; }

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
        require(allowed >= amount, "gsGST: allowance");
        allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    // ─── Reward distribution ──────────────────────────────────────────────────
    /// @notice Receive validator rewards and distribute to the pool (rebases gsGST).
    /// @dev Called by the protocol's reward distributor each epoch.
    function receiveRewards() external payable {
        require(msg.value > 0, "gsGST: zero reward");
        uint256 operatorCut  = (msg.value * OPERATOR_FEE_BPS) / 10_000;
        uint256 treasuryCut  = (msg.value * PROTOCOL_FEE_BPS) / 10_000;
        uint256 poolIncrease = msg.value - operatorCut - treasuryCut;

        totalPooledGST += poolIncrease;   // Rebases the exchange rate — all gsGST holders gain

        // Send treasury cut
        (bool ok,) = TREASURY.call{value: treasuryCut}("");
        require(ok, "gsGST: treasury transfer failed");

        emit RewardReceived(msg.value, operatorCut, treasuryCut);
        // Operator cut stays in contract for operators to claim — simple accounting here
    }

    // ─── Governance: operators ────────────────────────────────────────────────
    function addOperator(address op) external onlyGovernance {
        if (operatorIndex[op] != 0) revert OperatorAlreadyExists();
        if (operators.length >= MAX_OPERATORS) revert TooManyOperators();
        operators.push(Operator({ addr: op, delegated: 0, totalRewards: 0, active: true }));
        operatorIndex[op] = operators.length; // 1-based
        emit OperatorAdded(op);
    }

    function removeOperator(address op) external onlyGovernance {
        uint256 idx = operatorIndex[op];
        if (idx == 0) revert OperatorNotFound();
        operators[idx - 1].active = false;
        delete operatorIndex[op];
        emit OperatorRemoved(op);
    }

    function setDepositsPaused(bool paused) external onlyGovernance {
        depositsPaused = paused;
    }

    // ─── View helpers ─────────────────────────────────────────────────────────
    /// @notice GST value of one gsGST share.
    function exchangeRate() external view returns (uint256) {
        if (totalShares == 0) return GST_UNIT;
        return (totalPooledGST * GST_UNIT) / totalShares;
    }

    function withdrawalQueueLength(address user) external view returns (uint256) {
        return withdrawalQueue[user].length;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────
    function _gstToShares(uint256 gst) internal view returns (uint256) {
        if (totalShares == 0 || totalPooledGST == 0) return gst;
        return (gst * totalShares) / totalPooledGST;
    }

    function _sharesToGST(uint256 shareAmount) internal view returns (uint256) {
        if (totalShares == 0) return shareAmount;
        return (shareAmount * totalPooledGST) / totalShares;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(shares[from] >= amount, "gsGST: insufficient shares");
        shares[from] -= amount;
        shares[to]   += amount;
        emit Transfer(from, to, amount);
    }

    receive() external payable {}
}
