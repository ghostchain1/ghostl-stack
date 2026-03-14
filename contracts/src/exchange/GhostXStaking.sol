// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/ReentrancyGuard.sol";
import "./GhostXBadge.sol";
import "./GhostXFeeCollector.sol";

/// @title  GhostXStaking
/// @notice Stake GST (or any GRC-20 reward token) to earn a share of Ghost X trading fees
///         and unlock NFT badge tiers.
///
/// Mechanics:
///  • Stakers deposit a GRC-20 token (GST or GHOSTX governance token).
///  • The FeeCollector can push fee revenue into this contract via `depositRewards`.
///  • Rewards are distributed proportionally to the staked balance using a
///    per-share accumulator (standard "MasterChef" approach, 1e18 precision).
///  • Badge tiers are auto-upgraded when stake thresholds are met:
///      BRONZE  ≥   100 tokens   (always minted on first stake)
///      SILVER  ≥  1 000 tokens
///      GOLD    ≥ 10 000 tokens
///      DIAMOND ≥ 50 000 tokens
///  • Optional lock periods grant a bonus multiplier on rewards:
///      FLEXIBLE  – 1× multiplier
///      LOCKED_30 – 1.25× multiplier (30-day lock)
///      LOCKED_90 – 1.75× multiplier (90-day lock)
///      LOCKED_180 - 2.5×  multiplier (180-day lock)

interface IGST20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract GhostXStaking is ReentrancyGuard {
    // ─── Types ────────────────────────────────────────────────────────────────

    enum LockPeriod { FLEXIBLE, LOCKED_30, LOCKED_90, LOCKED_180 }

    struct Stake {
        uint256    amount;          // raw token amount staked
        uint256    weightedAmount;  // amount × multiplier, used for reward share
        uint256    rewardDebt;      // reward debt for accumulator accounting
        uint256    unlocksAt;       // 0 if FLEXIBLE
        LockPeriod lockPeriod;
        uint256    pendingRewards;  // harvested but unclaimed rewards
    }

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 constant PRECISION = 1e18;

    uint256 constant BRONZE_THRESHOLD  =     100 * 1e18;
    uint256 constant SILVER_THRESHOLD  =   1_000 * 1e18;
    uint256 constant GOLD_THRESHOLD    =  10_000 * 1e18;
    uint256 constant DIAMOND_THRESHOLD =  50_000 * 1e18;

    /// Multipliers in basis points (1× = 10_000).
    uint256 constant MUL_FLEXIBLE  = 10_000;
    uint256 constant MUL_30        = 12_500;
    uint256 constant MUL_90        = 17_500;
    uint256 constant MUL_180       = 25_000;

    uint256 constant LOCK_30_SECS  = 30  days;
    uint256 constant LOCK_90_SECS  = 90  days;
    uint256 constant LOCK_180_SECS = 180 days;

    // ─── State ────────────────────────────────────────────────────────────────

    address public owner;
    IGST20Minimal public immutable stakeToken;   // token to stake (GST or similar)
    IGST20Minimal public immutable rewardToken;  // token paid as rewards (can equal stakeToken)
    GhostXBadge   public immutable badge;
    GhostXFeeCollector public immutable feeCollector;

    /// @dev Global reward-per-weighted-share accumulator (×PRECISION).
    uint256 public accRewardPerShare;
    /// @dev Total weighted stake across all stakers.
    uint256 public totalWeightedStake;
    /// @dev Total raw stake.
    uint256 public totalStake;

    mapping(address => Stake) public stakes;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Staked(address indexed user, uint256 amount, LockPeriod lockPeriod, uint256 weightedAmount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardsHarvested(address indexed user, uint256 amount);
    event RewardsDeposited(uint256 amount);
    event BadgeAwarded(address indexed user, GhostXBadge.Tier tier);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error ZeroAmount();
    error StillLocked(uint256 unlocksAt);
    error NoStake();
    error NotFeeCollector();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address stakeToken_,
        address rewardToken_,
        address badge_,
        address feeCollector_
    ) {
        require(
            stakeToken_    != address(0) &&
            rewardToken_   != address(0) &&
            badge_         != address(0) &&
            feeCollector_  != address(0),
            "staking: zero addr"
        );
        owner         = msg.sender;
        stakeToken    = IGST20Minimal(stakeToken_);
        rewardToken   = IGST20Minimal(rewardToken_);
        badge         = GhostXBadge(badge_);
        feeCollector  = GhostXFeeCollector(feeCollector_);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0));
        owner = newOwner;
    }

    // ─── Reward injection (called by FeeCollector sweep or owner) ────────────

    /// @notice Inject fee revenue into the reward pool.
    ///         Called by GhostXFeeCollector.sweepToStaking() or by the owner directly.
    function depositRewards(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        require(
            msg.sender == address(feeCollector) || msg.sender == owner,
            "staking: unauthorized"
        );
        if (totalWeightedStake > 0) {
            accRewardPerShare += (amount * PRECISION) / totalWeightedStake;
        }
        // Transfer reward tokens in (caller must have approved).
        require(rewardToken.transferFrom(msg.sender, address(this), amount), "GST: reward transferFrom failed");
        emit RewardsDeposited(amount);
    }

    // ─── Staking ─────────────────────────────────────────────────────────────

    /// @notice Stake tokens for the chosen lock period.
    function stake(uint256 amount, LockPeriod lockPeriod) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        _harvestInternal(msg.sender);

        require(stakeToken.transferFrom(msg.sender, address(this), amount), "GST: stake transferFrom failed");

        uint256 multiplier = _multiplier(lockPeriod);
        uint256 weighted   = (amount * multiplier) / 10_000;

        Stake storage s = stakes[msg.sender];
        s.amount          += amount;
        s.weightedAmount  += weighted;
        s.lockPeriod       = lockPeriod;
        s.unlocksAt        = _lockExpiry(lockPeriod);
        s.rewardDebt       = (s.weightedAmount * accRewardPerShare) / PRECISION;

        totalStake         += amount;
        totalWeightedStake += weighted;

        _refreshBadge(msg.sender, s.amount);

        emit Staked(msg.sender, amount, lockPeriod, weighted);
    }

    /// @notice Unstake all tokens (must be past lock period).
    function unstake() external nonReentrant {
        Stake storage s = stakes[msg.sender];
        if (s.amount == 0) revert NoStake();
        if (s.unlocksAt > 0 && block.timestamp < s.unlocksAt) revert StillLocked(s.unlocksAt);

        _harvestInternal(msg.sender);

        uint256 amount   = s.amount;
        uint256 weighted = s.weightedAmount;

        totalStake         -= amount;
        totalWeightedStake -= weighted;

        s.amount         = 0;
        s.weightedAmount = 0;
        s.rewardDebt     = 0;
        s.unlocksAt      = 0;

        require(stakeToken.transfer(msg.sender, amount), "GST: stake transfer failed");
        emit Unstaked(msg.sender, amount);
    }

    /// @notice Partial unstake — only available for FLEXIBLE stakes.
    function unstakePartial(uint256 amount) external nonReentrant {
        Stake storage s = stakes[msg.sender];
        if (s.amount == 0) revert NoStake();
        if (s.lockPeriod != LockPeriod.FLEXIBLE) revert StillLocked(s.unlocksAt);
        if (amount == 0 || amount > s.amount) revert ZeroAmount();

        _harvestInternal(msg.sender);

        uint256 weighted = (amount * _multiplier(s.lockPeriod)) / 10_000;
        s.amount         -= amount;
        s.weightedAmount -= weighted;
        s.rewardDebt      = (s.weightedAmount * accRewardPerShare) / PRECISION;

        totalStake         -= amount;
        totalWeightedStake -= weighted;

        require(stakeToken.transfer(msg.sender, amount), "GST: stake transfer failed");
        emit Unstaked(msg.sender, amount);
    }

    /// @notice Claim pending rewards without unstaking.
    function harvest() external nonReentrant {
        _harvestInternal(msg.sender);
        uint256 pending = stakes[msg.sender].pendingRewards;
        if (pending == 0) return;
        stakes[msg.sender].pendingRewards = 0;
        require(rewardToken.transfer(msg.sender, pending), "GST: reward transfer failed");
        emit RewardsHarvested(msg.sender, pending);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /// @notice Pending rewards for a staker.
    function pendingRewards(address user) external view returns (uint256) {
        Stake storage s = stakes[user];
        if (s.weightedAmount == 0) return s.pendingRewards;
        uint256 accumulated = (s.weightedAmount * accRewardPerShare) / PRECISION;
        uint256 debt        = s.rewardDebt;
        return s.pendingRewards + (accumulated > debt ? accumulated - debt : 0);
    }

    /// @notice Returns all stake info for a user.
    function getStake(address user) external view returns (Stake memory) {
        return stakes[user];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _harvestInternal(address user) internal {
        Stake storage s = stakes[user];
        if (s.weightedAmount > 0) {
            uint256 accumulated = (s.weightedAmount * accRewardPerShare) / PRECISION;
            uint256 pending     = accumulated > s.rewardDebt ? accumulated - s.rewardDebt : 0;
            s.pendingRewards   += pending;
            s.rewardDebt        = accumulated;
        }
    }

    function _multiplier(LockPeriod p) internal pure returns (uint256) {
        if (p == LockPeriod.LOCKED_30)  return MUL_30;
        if (p == LockPeriod.LOCKED_90)  return MUL_90;
        if (p == LockPeriod.LOCKED_180) return MUL_180;
        return MUL_FLEXIBLE;
    }

    function _lockExpiry(LockPeriod p) internal view returns (uint256) {
        if (p == LockPeriod.LOCKED_30)  return block.timestamp + LOCK_30_SECS;
        if (p == LockPeriod.LOCKED_90)  return block.timestamp + LOCK_90_SECS;
        if (p == LockPeriod.LOCKED_180) return block.timestamp + LOCK_180_SECS;
        return 0;
    }

    function _refreshBadge(address user, uint256 totalStaked) internal {
        GhostXBadge.Tier needed = GhostXBadge.Tier.NONE;
        if (totalStaked >= DIAMOND_THRESHOLD) needed = GhostXBadge.Tier.DIAMOND;
        else if (totalStaked >= GOLD_THRESHOLD)   needed = GhostXBadge.Tier.GOLD;
        else if (totalStaked >= SILVER_THRESHOLD)  needed = GhostXBadge.Tier.SILVER;
        else if (totalStaked >= BRONZE_THRESHOLD)  needed = GhostXBadge.Tier.BRONZE;

        if (needed == GhostXBadge.Tier.NONE) return;

        if (!badge.hasBadge(user)) {
            badge.mintBadge(user);
            emit BadgeAwarded(user, GhostXBadge.Tier.BRONZE);
        }

        GhostXBadge.Badge memory current = badge.getBadge(user);
        if (uint8(needed) > uint8(current.tier)) {
            badge.upgradeBadge(user, needed);
            emit BadgeAwarded(user, needed);
        }
    }
}
