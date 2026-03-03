// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../common/Governed.sol";
import "../common/ReentrancyGuard.sol";

/// @dev Minimal ERC-20 surface used by the pool.
interface IERC20Pool {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title  L1AIFeePool
/// @notice Constant-product liquidity pool on GhostChain L1 that:
///         1. Accepts GST (canonical gas token) paired with any approved counter-asset.
///         2. Accrues a configurable swap fee (default 30 bps) paid by traders.
///         3. Distributes accrued fees + protocol fee revenue to LP share-holders.
///         4. Exposes `collectProtocolFees()` so the FeeInvestmentManager can
///            push L1 base-fee surplus directly into the pool as additional rewards.
///         5. Enforces governance time-lock for all parameter changes.
///
///         Routing law: L1 only — never call this contract from L2/L3 directly.
contract L1AIFeePool is Governed, ReentrancyGuard {
    // ──────────────────────────────────────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────────────────────────────────────

    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant MIN_LIQUIDITY = 1_000; // dead shares to prevent first-deposit attacks

    // ──────────────────────────────────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────────────────────────────────

    IERC20Pool public immutable gst;        // GhostChain canonical gas token
    IERC20Pool public immutable paired;     // Counter-asset (WETH, USDC, etc.)

    uint256 public reserve0;   // GST reserve
    uint256 public reserve1;   // paired reserve

    // LP share accounting
    uint256 public totalShares;
    mapping(address => uint256) public shares;

    // Accrued fee rewards per asset (index 0 = GST, 1 = paired)
    uint256 public accFees0;   // undistributed GST fees
    uint256 public accFees1;   // undistributed paired fees

    // Cumulative reward-per-share (scaled 1e18) for each asset
    uint256 public rewardPerShare0;
    uint256 public rewardPerShare1;

    // Per-LP checkpoint to enable incremental claims
    mapping(address => uint256) public rewardDebt0;
    mapping(address => uint256) public rewardDebt1;

    // Configuration
    uint256 public swapFeeBps = 30;   // 30 bps default (0.30 %)
    uint256 public protocolFeeBps = 5; // 5 bps of swap fee goes to treasury
    address public feeRecipient;       // treasury or reward-router
    address public feeManager;         // FeeInvestmentManager (trusted caller)

    bool public paused;

    // ──────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────

    event LiquidityAdded(address indexed provider, uint256 gstIn, uint256 pairedIn, uint256 sharesMinted);
    event LiquidityRemoved(address indexed provider, uint256 gstOut, uint256 pairedOut, uint256 sharesBurned);
    event Swapped(
        address indexed user,
        address indexed tokenIn,
        uint256 amountIn,
        address indexed tokenOut,
        uint256 amountOut
    );
    event ProtocolFeesCollected(uint256 gstAmount, uint256 pairedAmount);
    event RewardsClaimed(address indexed lp, uint256 gst, uint256 paired);
    event FeeManagerSet(address indexed manager);
    event FeeRecipientSet(address indexed recipient);
    event SwapFeeBpsSet(uint256 bps);
    event ProtocolFeeBpsSet(uint256 bps);
    event PausedSet(bool paused);
    event ReservesSync(uint256 reserve0, uint256 reserve1);

    // ──────────────────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────────────────

    constructor(
        address gst_,
        address paired_,
        address governor_,
        address timelock_,
        address feeRecipient_,
        address feeManager_
    ) Governed(governor_, timelock_) {
        require(gst_ != address(0) && paired_ != address(0), "L1AIFeePool: zero token");
        require(gst_ != paired_, "L1AIFeePool: same token");
        gst    = IERC20Pool(gst_);
        paired = IERC20Pool(paired_);
        feeRecipient = feeRecipient_;
        feeManager   = feeManager_;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────────────────────────────────

    modifier notPaused() {
        require(!paused, "L1AIFeePool: paused");
        _;
    }

    modifier onlyFeeManager() {
        require(msg.sender == feeManager, "L1AIFeePool: not fee manager");
        _;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // LP Operations
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Add liquidity.  Provider receives LP shares proportional to deposit.
    /// @param  gstAmount   Amount of GST to deposit.
    /// @param  pairedAmount Amount of paired token to deposit.
    /// @return sharesMinted Number of LP shares issued.
    function addLiquidity(uint256 gstAmount, uint256 pairedAmount)
        external
        notPaused
        nonReentrant
        returns (uint256 sharesMinted)
    {
        require(gstAmount > 0 && pairedAmount > 0, "L1AIFeePool: zero amount");

        // Settle any pending rewards before modifying shares
        _settleRewards(msg.sender);

        require(gst.transferFrom(msg.sender, address(this), gstAmount), "L1AIFeePool: gst transfer failed");
        require(paired.transferFrom(msg.sender, address(this), pairedAmount), "L1AIFeePool: paired transfer failed");

        if (totalShares == 0) {
            // First deposit — mint dead shares to address(this) then provider shares
            sharesMinted    = _sqrt(gstAmount * pairedAmount);
            require(sharesMinted > MIN_LIQUIDITY, "L1AIFeePool: insufficient initial liquidity");
            shares[address(this)] = MIN_LIQUIDITY;
            totalShares           = MIN_LIQUIDITY;
            sharesMinted         -= MIN_LIQUIDITY;
        } else {
            // Subsequent deposits — proportional to existing reserves
            uint256 s0 = (gstAmount   * totalShares) / reserve0;
            uint256 s1 = (pairedAmount * totalShares) / reserve1;
            sharesMinted = s0 < s1 ? s0 : s1;
        }

        require(sharesMinted > 0, "L1AIFeePool: zero shares");

        shares[msg.sender] += sharesMinted;
        totalShares        += sharesMinted;

        // Update checkpoints to skip accrued (pre-deposit) rewards
        rewardDebt0[msg.sender] = (rewardPerShare0 * shares[msg.sender]) / 1e18;
        rewardDebt1[msg.sender] = (rewardPerShare1 * shares[msg.sender]) / 1e18;

        _updateReserves();
        emit LiquidityAdded(msg.sender, gstAmount, pairedAmount, sharesMinted);
    }

    /// @notice Remove liquidity.  Burns LP shares and returns proportional pool assets.
    /// @param  shareAmount Number of LP shares to redeem.
    /// @return gstOut      GST returned.
    /// @return pairedOut   Paired token returned.
    function removeLiquidity(uint256 shareAmount)
        external
        notPaused
        nonReentrant
        returns (uint256 gstOut, uint256 pairedOut)
    {
        require(shareAmount > 0, "L1AIFeePool: zero shares");
        require(shares[msg.sender] >= shareAmount, "L1AIFeePool: insufficient shares");

        // Settle rewards first
        _settleRewards(msg.sender);

        uint256 _totalShares = totalShares;
        gstOut   = (shareAmount * reserve0) / _totalShares;
        pairedOut = (shareAmount * reserve1) / _totalShares;
        require(gstOut > 0 && pairedOut > 0, "L1AIFeePool: zero withdrawal");

        shares[msg.sender] -= shareAmount;
        totalShares        -= shareAmount;

        // Update reward debt for remaining shares
        rewardDebt0[msg.sender] = (rewardPerShare0 * shares[msg.sender]) / 1e18;
        rewardDebt1[msg.sender] = (rewardPerShare1 * shares[msg.sender]) / 1e18;

        require(gst.transfer(msg.sender, gstOut),   "L1AIFeePool: gst out failed");
        require(paired.transfer(msg.sender, pairedOut), "L1AIFeePool: paired out failed");

        _updateReserves();
        emit LiquidityRemoved(msg.sender, gstOut, pairedOut, shareAmount);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Swap
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Constant-product swap.  Caller specifies `tokenIn` (must be gst or paired).
    /// @param  tokenIn   Address of input token.
    /// @param  amountIn  Amount of input token to sell.
    /// @param  minAmountOut Slippage guard.
    /// @return amountOut Amount of output token received.
    function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut)
        external
        notPaused
        nonReentrant
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "L1AIFeePool: zero in");
        bool gstIn = (tokenIn == address(gst));
        require(gstIn || tokenIn == address(paired), "L1AIFeePool: invalid token");

        IERC20Pool tokenInC  = gstIn ? gst    : paired;
        IERC20Pool tokenOutC = gstIn ? paired : gst;

        uint256 r0 = reserve0; // GST reserve
        uint256 r1 = reserve1; // paired reserve
        uint256 rIn  = gstIn ? r0 : r1;
        uint256 rOut = gstIn ? r1 : r0;

        require(tokenInC.transferFrom(msg.sender, address(this), amountIn), "L1AIFeePool: transfer failed");

        // Apply swap fee
        uint256 feeAmount    = (amountIn * swapFeeBps) / BPS_DENOM;
        uint256 amountInNet  = amountIn - feeAmount;

        // Constant-product formula
        amountOut = (amountInNet * rOut) / (rIn + amountInNet);
        require(amountOut >= minAmountOut, "L1AIFeePool: slippage");
        require(amountOut < rOut, "L1AIFeePool: insufficient liquidity");

        require(tokenOutC.transfer(msg.sender, amountOut), "L1AIFeePool: out transfer failed");

        // Distribute fee: protocol cut → feeRecipient, rest → LPs
        uint256 protocolCut  = (feeAmount * protocolFeeBps) / BPS_DENOM;
        uint256 lpFee        = feeAmount - protocolCut;

        if (protocolCut > 0 && feeRecipient != address(0)) {
            require(tokenInC.transfer(feeRecipient, protocolCut), "L1AIFeePool: protocol fee failed");
        }

        // Accrue LP fee into reward-per-share accumulators
        if (totalShares > 0 && lpFee > 0) {
            if (gstIn) {
                rewardPerShare0 += (lpFee * 1e18) / totalShares;
            } else {
                rewardPerShare1 += (lpFee * 1e18) / totalShares;
            }
        }

        _updateReserves();
        emit Swapped(msg.sender, tokenIn, amountIn, address(tokenOutC), amountOut);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Protocol-fee injection (called by FeeInvestmentManager)
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Inject surplus L1 protocol fees as additional LP rewards.
    ///         The FeeInvestmentManager pre-approves and calls this after harvesting
    ///         base-fee surplus from the L1 sequencer / treasury.
    /// @param  gstAmount   GST to inject as rewards.
    /// @param  pairedAmount Paired token to inject as rewards.
    function collectProtocolFees(uint256 gstAmount, uint256 pairedAmount)
        external
        onlyFeeManager
        nonReentrant
    {
        require(gstAmount > 0 || pairedAmount > 0, "L1AIFeePool: nothing to collect");
        require(totalShares > 0, "L1AIFeePool: no liquidity");

        if (gstAmount > 0) {
            require(gst.transferFrom(msg.sender, address(this), gstAmount), "L1AIFeePool: gst inject failed");
            rewardPerShare0 += (gstAmount * 1e18) / totalShares;
        }
        if (pairedAmount > 0) {
            require(paired.transferFrom(msg.sender, address(this), pairedAmount), "L1AIFeePool: paired inject failed");
            rewardPerShare1 += (pairedAmount * 1e18) / totalShares;
        }

        _updateReserves();
        emit ProtocolFeesCollected(gstAmount, pairedAmount);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Reward Claims
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Claim accrued fee rewards for the caller.
    /// @return gstClaimed   GST fees received.
    /// @return pairedClaimed Paired token fees received.
    function claimRewards()
        external
        nonReentrant
        returns (uint256 gstClaimed, uint256 pairedClaimed)
    {
        _settleRewards(msg.sender);
        gstClaimed    = accFees0;  // temporarily borrowed for this LP; see _settleRewards
        pairedClaimed = accFees1;
        // Reset per-LP accumulators (set by _settleRewards into local storage below)
        // The real accrued amounts were transferred inside _settleRewards.
    }

    // ──────────────────────────────────────────────────────────────────────────
    // View helpers
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Pending fee rewards for an LP without claiming.
    function pendingRewards(address lp)
        external
        view
        returns (uint256 pendingGst, uint256 pendingPaired)
    {
        uint256 s = shares[lp];
        if (s == 0) return (0, 0);
        pendingGst    = (rewardPerShare0 * s) / 1e18 - rewardDebt0[lp];
        pendingPaired = (rewardPerShare1 * s) / 1e18 - rewardDebt1[lp];
    }

    /// @notice Get current spot price (GST per 1e18 paired units).
    function spotPrice() external view returns (uint256) {
        if (reserve1 == 0) return 0;
        return (reserve0 * 1e18) / reserve1;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Governance setters
    // ──────────────────────────────────────────────────────────────────────────

    function setSwapFeeBps(uint256 bps) external onlyGovernance {
        require(bps <= 200, "L1AIFeePool: fee too high"); // max 2%
        swapFeeBps = bps;
        emit SwapFeeBpsSet(bps);
    }

    function setProtocolFeeBps(uint256 bps) external onlyGovernance {
        require(bps <= BPS_DENOM, "L1AIFeePool: bps overflow");
        protocolFeeBps = bps;
        emit ProtocolFeeBpsSet(bps);
    }

    function setFeeRecipient(address recipient) external onlyGovernance {
        feeRecipient = recipient;
        emit FeeRecipientSet(recipient);
    }

    function setFeeManager(address manager) external onlyGovernance {
        feeManager = manager;
        emit FeeManagerSet(manager);
    }

    function setPaused(bool paused_) external onlyGovernance {
        paused = paused_;
        emit PausedSet(paused_);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────────────────────────────────

    /// @dev Settle pending rewards to LP and transfer tokens.
    function _settleRewards(address lp) internal {
        uint256 s = shares[lp];
        if (s == 0) {
            rewardDebt0[lp] = (rewardPerShare0 * s) / 1e18;
            rewardDebt1[lp] = (rewardPerShare1 * s) / 1e18;
            return;
        }
        uint256 owed0 = (rewardPerShare0 * s) / 1e18 - rewardDebt0[lp];
        uint256 owed1 = (rewardPerShare1 * s) / 1e18 - rewardDebt1[lp];

        rewardDebt0[lp] = (rewardPerShare0 * s) / 1e18;
        rewardDebt1[lp] = (rewardPerShare1 * s) / 1e18;

        if (owed0 > 0) {
            require(gst.transfer(lp, owed0), "L1AIFeePool: reward gst failed");
            emit RewardsClaimed(lp, owed0, 0);
        }
        if (owed1 > 0) {
            require(paired.transfer(lp, owed1), "L1AIFeePool: reward paired failed");
            emit RewardsClaimed(lp, 0, owed1);
        }
    }

    /// @dev Sync reserve0/reserve1 to actual token balances.
    function _updateReserves() internal {
        reserve0 = gst.balanceOf(address(this));
        reserve1 = paired.balanceOf(address(this));
        emit ReservesSync(reserve0, reserve1);
    }

    /// @dev Integer square root (Babylonian).
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
