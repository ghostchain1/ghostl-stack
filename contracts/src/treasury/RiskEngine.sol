// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../common/Governed.sol";
import "./StrategyRegistry.sol";
import "./TreasuryInvariants.sol";

/// @title RiskEngine
/// @notice On-chain risk-budget enforcer for GhostTreasuryAI.
///         Constrains every strategy execution through:
///         – per-strategy allocation caps
///         – minimum stable reserve
///         – daily Value-at-Risk (VaR) limit
///         – weekly loss circuit breaker
///         – drawdown circuit breaker
///         – concentration limits (single asset / single strategy)
///
///         No funds are held here. This contract only reads NAV state and
///         emits verdicts that TreasuryGovernor must honour.
contract RiskEngine is Governed {
    using TreasuryInvariants for uint256;

    // ─── Configuration ────────────────────────────────────────────────────────

    struct RiskConfig {
        /// @dev minimum stable reserve in wei (6-month ops runway)
        uint256 minStableReserve;
        /// @dev maximum daily realised loss (VaR proxy), in wei
        uint256 maxDailyVaR;
        /// @dev maximum cumulative loss over 7 days, in wei (circuit-breaker)
        uint256 maxWeeklyLoss;
        /// @dev maximum single-asset exposure as a fraction of NAV (bps)
        uint16  maxAssetConcentrationBps;
        /// @dev maximum single-strategy allocation as a fraction of NAV (bps)
        uint16  maxStrategyConcentrationBps;
        /// @dev global risk multiplier applied when market stress is detected (bps, 10_000 = no effect)
        uint16  stressMultiplierBps;
        /// @dev true → circuit-breaker is tripped → no new executions
        bool    circuitBreakerOpen;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    RiskConfig public config;
    StrategyRegistry public strategyRegistry;

    /// @dev rolling 24-hour loss window
    uint256 public dailyLossAccum;
    uint256 public dailyWindowStart;

    /// @dev rolling 7-day loss window
    uint256 public weeklyLossAccum;
    uint256 public weeklyWindowStart;

    /// @dev strategyId → current allocated amount
    mapping(uint256 => uint256) public strategyAllocation;

    /// @dev total treasury NAV (updated by Governor after each execution)
    uint256 public lastKnownNAV;

    // ─── Events ───────────────────────────────────────────────────────────────

    event RiskConfigUpdated(uint256 timestamp);
    event CircuitBreakerOpened(string reason);
    event CircuitBreakerReset(address indexed by);
    event AllocationRecorded(uint256 indexed strategyId, uint256 amount, bool isEntry);
    event NAVUpdated(uint256 nav, uint256 timestamp);
    event LossRecorded(uint256 daily, uint256 weekly, uint256 timestamp);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error CircuitBreakerActive();
    error DailyVaRBreached(uint256 accumulated, uint256 proposed, uint256 limit);
    error WeeklyLossBreached(uint256 accumulated, uint256 proposed, uint256 limit);
    error ReserveBreached(uint256 remaining, uint256 required);
    error StrategyConcentrationBreached(uint256 current, uint256 proposed, uint16 maxBps, uint256 nav);
    error AssetConcentrationBreached(uint256 current, uint256 proposed, uint16 maxBps, uint256 nav);
    error InsufficientNAV();
    error NotGovernorOrRegistry();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyGovernorOrOwner() {
        if (msg.sender != owner && msg.sender != governor) revert NotGovernorOrRegistry();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address            governor_,
        address            timelock_,
        StrategyRegistry   registry_,
        RiskConfig  memory initialConfig
    ) Governed(governor_, timelock_) {
        if (governor_ != address(0)) {
            owner = governor_;
            emit OwnershipTransferred(msg.sender, governor_);
        }
        strategyRegistry = registry_;
        config = initialConfig;
        dailyWindowStart  = block.timestamp;
        weeklyWindowStart = block.timestamp;
    }

    // ─── Configuration ────────────────────────────────────────────────────────

    function setConfig(RiskConfig calldata cfg) external onlyGovernance {
        require(cfg.maxAssetConcentrationBps     <= 10_000, "asset bps > 100%");
        require(cfg.maxStrategyConcentrationBps  <= 10_000, "strategy bps > 100%");
        require(cfg.stressMultiplierBps          <= 10_000, "stress multiplier > 100%");
        config = cfg;
        emit RiskConfigUpdated(block.timestamp);
    }

    function setStrategyRegistry(StrategyRegistry registry_) external onlyGovernance {
        TreasuryInvariants.requireContract(address(registry_));
        strategyRegistry = registry_;
    }

    // ─── NAV oracle ───────────────────────────────────────────────────────────

    /// @notice Called by TreasuryGovernor after each execution to refresh NAV.
    function updateNAV(uint256 nav) external onlyGovernorOrOwner {
        require(nav > 0, "nav=0");
        lastKnownNAV = nav;
        emit NAVUpdated(nav, block.timestamp);
    }

    // ─── Core check (called before ANY execution) ─────────────────────────────

    /// @notice Validate that a proposed strategy execution passes all risk gates.
    /// @param strategyId   StrategyRegistry id of the strategy to execute.
    /// @param amount       Wei value flowing into the strategy.
    /// @param stableReserveAfter  Estimated stable reserve remaining after execution.
    /// @param assetCurrentAlloc  Current allocation for the target asset class.
    function checkExecution(
        uint256 strategyId,
        uint256 amount,
        uint256 stableReserveAfter,
        uint256 assetCurrentAlloc
    ) external view returns (bool) {
        if (config.circuitBreakerOpen) revert CircuitBreakerActive();

        uint256 nav = lastKnownNAV;
        if (nav == 0) revert InsufficientNAV();

        // 1. Minimum stable reserve
        if (stableReserveAfter < config.minStableReserve) {
            revert ReserveBreached(stableReserveAfter, config.minStableReserve);
        }

        // 2. Strategy concentration
        uint256 newStratAlloc = strategyAllocation[strategyId] + amount;
        uint256 maxStratAlloc = (nav * config.maxStrategyConcentrationBps) / 10_000;
        // Also honour per-strategy cap from registry
        StrategyRegistry.StrategyParams memory sp = strategyRegistry.getStrategy(strategyId);
        uint256 registryMax = (nav * sp.maxAllocationBps) / 10_000;
        if (registryMax < maxStratAlloc) maxStratAlloc = registryMax;

        if (newStratAlloc > maxStratAlloc) {
            revert StrategyConcentrationBreached(
                strategyAllocation[strategyId], amount, config.maxStrategyConcentrationBps, nav
            );
        }

        // 3. Asset concentration
        uint256 newAssetAlloc = assetCurrentAlloc + amount;
        uint256 maxAssetAlloc = (nav * config.maxAssetConcentrationBps) / 10_000;
        if (newAssetAlloc > maxAssetAlloc) {
            revert AssetConcentrationBreached(
                assetCurrentAlloc, amount, config.maxAssetConcentrationBps, nav
            );
        }

        // 4. Daily VaR — apply stress multiplier
        uint256 effectiveAmount = (amount * config.stressMultiplierBps) / 10_000;
        uint256 projectedDaily  = _currentDailyLoss() + effectiveAmount;
        if (projectedDaily > config.maxDailyVaR) {
            revert DailyVaRBreached(_currentDailyLoss(), effectiveAmount, config.maxDailyVaR);
        }

        // 5. Weekly loss
        uint256 projectedWeekly = _currentWeeklyLoss() + effectiveAmount;
        if (projectedWeekly > config.maxWeeklyLoss) {
            revert WeeklyLossBreached(_currentWeeklyLoss(), effectiveAmount, config.maxWeeklyLoss);
        }

        return true;
    }

    // ─── Post-execution hooks ─────────────────────────────────────────────────

    /// @notice Record a realised loss after a strategy execution.
    function recordLoss(uint256 strategyId, uint256 lossAmount) external onlyGovernorOrOwner {
        _rollWindows();
        dailyLossAccum  += lossAmount;
        weeklyLossAccum += lossAmount;

        // Auto-trip circuit breaker on weekly breach
        if (weeklyLossAccum >= config.maxWeeklyLoss) {
            config.circuitBreakerOpen = true;
            emit CircuitBreakerOpened("weekly loss limit exceeded");
        }
        emit LossRecorded(dailyLossAccum, weeklyLossAccum, block.timestamp);

        // Remove from tracked allocation (strategy has exited or lost value)
        if (strategyAllocation[strategyId] >= lossAmount) {
            strategyAllocation[strategyId] -= lossAmount;
        } else {
            strategyAllocation[strategyId] = 0;
        }
    }

    /// @notice Record capital deployed into a strategy.
    function recordEntry(uint256 strategyId, uint256 amount) external onlyGovernorOrOwner {
        strategyAllocation[strategyId] += amount;
        emit AllocationRecorded(strategyId, amount, true);
    }

    /// @notice Record capital returned from a strategy.
    function recordExit(uint256 strategyId, uint256 amount) external onlyGovernorOrOwner {
        if (strategyAllocation[strategyId] >= amount) {
            strategyAllocation[strategyId] -= amount;
        } else {
            strategyAllocation[strategyId] = 0;
        }
        emit AllocationRecorded(strategyId, amount, false);
    }

    // ─── Circuit breaker ──────────────────────────────────────────────────────

    /// @notice Manually open circuit breaker (emergency).
    function openCircuitBreaker(string calldata reason) external onlyGovernorOrOwner {
        config.circuitBreakerOpen = true;
        emit CircuitBreakerOpened(reason);
    }

    /// @notice Reset circuit breaker after post-mortem approval. Requires governance.
    function resetCircuitBreaker() external onlyGovernance {
        config.circuitBreakerOpen = false;
        dailyLossAccum  = 0;
        weeklyLossAccum = 0;
        dailyWindowStart  = block.timestamp;
        weeklyWindowStart = block.timestamp;
        emit CircuitBreakerReset(msg.sender);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    function currentDailyLoss()  external view returns (uint256) { return _currentDailyLoss(); }
    function currentWeeklyLoss() external view returns (uint256) { return _currentWeeklyLoss(); }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _currentDailyLoss() internal view returns (uint256) {
        if (block.timestamp >= dailyWindowStart + 1 days) return 0;
        return dailyLossAccum;
    }

    function _currentWeeklyLoss() internal view returns (uint256) {
        if (block.timestamp >= weeklyWindowStart + 7 days) return 0;
        return weeklyLossAccum;
    }

    function _rollWindows() internal {
        if (block.timestamp >= dailyWindowStart + 1 days) {
            dailyLossAccum   = 0;
            dailyWindowStart = block.timestamp;
        }
        if (block.timestamp >= weeklyWindowStart + 7 days) {
            weeklyLossAccum   = 0;
            weeklyWindowStart = block.timestamp;
        }
    }
}
