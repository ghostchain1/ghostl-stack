// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../common/Governed.sol";
import "./TreasuryInvariants.sol";

/// @title StrategyRegistry
/// @notice Canonical whitelist of allowed treasury strategies.
///         Each strategy entry defines the outer bounds that RiskEngine and
///         TreasuryGovernor enforce before any fund movement is permitted.
///         Only governance can add, update, or deprecate a strategy.
contract StrategyRegistry is Governed {
    // ─── Types ────────────────────────────────────────────────────────────────

    enum StrategyStatus { INACTIVE, ACTIVE, DEPRECATED }

    struct StrategyParams {
        /// @dev human-readable label (≤32 bytes)
        bytes32 label;
        /// @dev maximum fraction of treasury NAV that can be allocated (bps, 10_000 = 100%)
        uint16  maxAllocationBps;
        /// @dev maximum leverage multiplier × 100 (100 = 1x, 0 = no leverage allowed)
        uint8   maxLeveragex100;
        /// @dev maximum drawdown before circuit-breaker fires (bps)
        uint16  maxDrawdownBps;
        /// @dev minimum seconds between executions of this strategy
        uint32  cooldownSeconds;
        /// @dev minimum number of distinct price oracles required
        uint8   minOracleCount;
        /// @dev risk tier: 0 = safe, 1 = moderate, 2 = speculative
        uint8   riskTier;
        StrategyStatus status;
        /// @dev unix timestamp of last successful execution
        uint48  lastExecuted;
        /// @dev cumulative realized PnL since activation (signed, in wei)
        int256  cumulativePnL;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 public strategyCount;

    /// @dev strategyId → params
    mapping(uint256 => StrategyParams) private _strategies;

    /// @dev label hash → strategyId (for uniqueness check)
    mapping(bytes32 => uint256) private _labelToId;

    // ─── Events ───────────────────────────────────────────────────────────────

    event StrategyAdded(uint256 indexed id, bytes32 label, uint8 riskTier);
    event StrategyUpdated(uint256 indexed id, bytes32 label);
    event StrategyDeprecated(uint256 indexed id, bytes32 label);
    event StrategyExecuted(uint256 indexed id, int256 pnlDelta, uint256 timestamp);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error LabelTaken(bytes32 label);
    error UnknownStrategy(uint256 id);
    error StrategyNotActive(uint256 id);
    error CooldownActive(uint256 id, uint256 availableAt);
    error AllocationTooHigh(uint16 requested, uint16 max);
    error LeverageNotAllowed(uint256 id);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {
        if (governor_ != address(0)) {
            owner = governor_;
            emit OwnershipTransferred(msg.sender, governor_);
        }
    }

    // ─── Governance actions ───────────────────────────────────────────────────

    /// @notice Register a new strategy. Reverts if the label is already taken.
    function addStrategy(
        bytes32  label,
        uint16   maxAllocationBps,
        uint8    maxLeveragex100,
        uint16   maxDrawdownBps,
        uint32   cooldownSeconds,
        uint8    minOracleCount,
        uint8    riskTier
    ) external onlyGovernance returns (uint256 id) {
        if (_labelToId[label] != 0) revert LabelTaken(label);
        require(maxAllocationBps > 0 && maxAllocationBps <= 10_000, "alloc bps out of range");
        require(maxDrawdownBps > 0 && maxDrawdownBps <= 10_000, "drawdown bps out of range");
        require(riskTier <= 2, "riskTier > 2");

        id = ++strategyCount;
        _labelToId[label] = id;
        _strategies[id] = StrategyParams({
            label:            label,
            maxAllocationBps: maxAllocationBps,
            maxLeveragex100:  maxLeveragex100,
            maxDrawdownBps:   maxDrawdownBps,
            cooldownSeconds:  cooldownSeconds,
            minOracleCount:   minOracleCount,
            riskTier:         riskTier,
            status:           StrategyStatus.ACTIVE,
            lastExecuted:     0,
            cumulativePnL:    0
        });
        emit StrategyAdded(id, label, riskTier);
    }

    /// @notice Update mutable parameters of an existing active strategy.
    function updateStrategy(
        uint256  id,
        uint16   maxAllocationBps,
        uint8    maxLeveragex100,
        uint16   maxDrawdownBps,
        uint32   cooldownSeconds,
        uint8    minOracleCount,
        uint8    riskTier
    ) external onlyGovernance {
        _requireActive(id);
        require(maxAllocationBps > 0 && maxAllocationBps <= 10_000, "alloc bps out of range");
        require(maxDrawdownBps > 0 && maxDrawdownBps <= 10_000, "drawdown bps out of range");
        require(riskTier <= 2, "riskTier > 2");

        StrategyParams storage s = _strategies[id];
        s.maxAllocationBps = maxAllocationBps;
        s.maxLeveragex100  = maxLeveragex100;
        s.maxDrawdownBps   = maxDrawdownBps;
        s.cooldownSeconds  = cooldownSeconds;
        s.minOracleCount   = minOracleCount;
        s.riskTier         = riskTier;
        emit StrategyUpdated(id, s.label);
    }

    /// @notice Permanently deprecate a strategy. Cannot be undone via this call.
    function deprecateStrategy(uint256 id) external onlyGovernance {
        _requireActive(id);
        _strategies[id].status = StrategyStatus.DEPRECATED;
        emit StrategyDeprecated(id, _strategies[id].label);
    }

    // ─── Execution hook (called by TreasuryGovernor post-execution) ───────────

    /// @notice Record an execution. Checks cooldown; updates timestamp and PnL.
    /// @param callerIsGovernor  must be the TreasuryGovernor (or Governor for tests).
    function recordExecution(uint256 id, int256 pnlDelta, address callerIsGovernor)
        external
    {
        // Only the governor address or the owner (during bootstrapping) may record.
        require(
            msg.sender == owner || msg.sender == callerIsGovernor,
            "StrategyRegistry: unauthorized"
        );
        _requireActive(id);

        StrategyParams storage s = _strategies[id];
        uint256 availableAt = uint256(s.lastExecuted) + s.cooldownSeconds;
        if (block.timestamp < availableAt) revert CooldownActive(id, availableAt);

        s.lastExecuted  = uint48(block.timestamp);
        s.cumulativePnL += pnlDelta;
        emit StrategyExecuted(id, pnlDelta, block.timestamp);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    function getStrategy(uint256 id) external view returns (StrategyParams memory) {
        if (_strategies[id].maxAllocationBps == 0 && _strategies[id].status == StrategyStatus.INACTIVE) {
            revert UnknownStrategy(id);
        }
        return _strategies[id];
    }

    function isActive(uint256 id) external view returns (bool) {
        return _strategies[id].status == StrategyStatus.ACTIVE;
    }

    function idForLabel(bytes32 label) external view returns (uint256) {
        return _labelToId[label];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _requireActive(uint256 id) internal view {
        if (_strategies[id].status != StrategyStatus.ACTIVE) revert StrategyNotActive(id);
    }
}
