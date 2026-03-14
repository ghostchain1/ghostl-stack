// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";

/// @title TreasuryInvariant
/// @notice Governance-enforced bounds for GST treasury operations:
///         buyback, burn, allocation, and reserve ratios.
///
/// @dev All treasury actions are bounded by constitutional limits that can only
///      be modified via governance vote with the full timelock delay.
///      No single actor (including the treasury multisig) may unilaterally
///      exceed these bounds.
///
///      Constitutional treasury bounds (defaults — adjustable via governance only):
///        - maxSingleBuybackBps:  500  (5% of circulating supply per tx)
///        - maxSingleBurnBps:     200  (2% of circulating supply per tx)
///        - minReserveBps:        1000 (10% of supply held in reserve always)
///        - maxDailySpendBps:     1000 (10% of treasury per 24h window)
///
///      References: docs/TREASURY_CONSTITUTION.md, contracts/src/governance/
abstract contract TreasuryInvariant is GhostBrand {
    // ─── Errors ───────────────────────────────────────────────────────────────

    error TreasuryInvariant_BuybackExceedsLimit(uint256 amount, uint256 maxAllowed);
    error TreasuryInvariant_BurnExceedsLimit(uint256 amount, uint256 maxAllowed);
    error TreasuryInvariant_ReserveBelowMinimum(uint256 reserveAfter, uint256 minRequired);
    error TreasuryInvariant_DailySpendExceedsLimit(uint256 totalSpentToday, uint256 maxAllowed);
    error TreasuryInvariant_ZeroSupply();
    error TreasuryInvariant_UnauthorizedParamChange(address caller);

    // ─── Events ───────────────────────────────────────────────────────────────

    event TreasuryParamUpdated(string param, uint256 oldValue, uint256 newValue, address governor);
    event TreasuryInvariantChecked(string operation, uint256 amount, uint256 circulatingSupply);

    // ─── Basis points constants ───────────────────────────────────────────────

    uint256 internal constant BPS_DENOMINATOR = 10_000;

    // ─── Constitutional default bounds ────────────────────────────────────────

    uint256 internal _maxSingleBuybackBps = 500;  // 5%
    uint256 internal _maxSingleBurnBps    = 200;  // 2%
    uint256 internal _minReserveBps       = 1000; // 10%
    uint256 internal _maxDailySpendBps    = 1000; // 10%

    // ─── Daily spend tracking ─────────────────────────────────────────────────

    uint256 private _dailySpendEpoch;    // Unix day (timestamp / 86400)
    uint256 private _dailySpentAmount;   // GST base units spent this epoch

    // ─── Core invariant checks ────────────────────────────────────────────────

    /// @notice Validates a proposed buyback amount against constitutional bounds.
    /// @param amount            GST base units to buy back
    /// @param circulatingSupply Current circulating GST base units
    function _assertBuybackBound(uint256 amount, uint256 circulatingSupply) internal {
        if (circulatingSupply == 0) revert TreasuryInvariant_ZeroSupply();
        uint256 maxAllowed = (circulatingSupply * _maxSingleBuybackBps) / BPS_DENOMINATOR;
        if (amount > maxAllowed) {
            revert TreasuryInvariant_BuybackExceedsLimit(amount, maxAllowed);
        }
        emit TreasuryInvariantChecked("buyback", amount, circulatingSupply);
    }

    /// @notice Validates a proposed burn amount against constitutional bounds.
    /// @param amount            GST base units to burn
    /// @param circulatingSupply Current circulating GST base units
    function _assertBurnBound(uint256 amount, uint256 circulatingSupply) internal {
        if (circulatingSupply == 0) revert TreasuryInvariant_ZeroSupply();
        uint256 maxAllowed = (circulatingSupply * _maxSingleBurnBps) / BPS_DENOMINATOR;
        if (amount > maxAllowed) {
            revert TreasuryInvariant_BurnExceedsLimit(amount, maxAllowed);
        }
        emit TreasuryInvariantChecked("burn", amount, circulatingSupply);
    }

    /// @notice Validates that the reserve remains above the constitutional minimum after a spend.
    /// @param reserveAfterSpend  Treasury balance after the proposed spend (GST base units)
    /// @param circulatingSupply  Current circulating supply
    function _assertReserveMinimum(uint256 reserveAfterSpend, uint256 circulatingSupply) internal view {
        if (circulatingSupply == 0) revert TreasuryInvariant_ZeroSupply();
        uint256 minRequired = (circulatingSupply * _minReserveBps) / BPS_DENOMINATOR;
        if (reserveAfterSpend < minRequired) {
            revert TreasuryInvariant_ReserveBelowMinimum(reserveAfterSpend, minRequired);
        }
    }

    /// @notice Validates daily spend window and records spend.
    ///         Automatically resets the window at UTC day boundaries.
    /// @param spendAmount GST base units being spent
    /// @param maxTreasuryBalance Treasury balance (used to compute daily cap)
    function _assertAndRecordDailySpend(uint256 spendAmount, uint256 maxTreasuryBalance) internal {
        uint256 today = block.timestamp / 86400;
        if (today > _dailySpendEpoch) {
            _dailySpendEpoch = today;
            _dailySpentAmount = 0;
        }
        uint256 dailyCap = (maxTreasuryBalance * _maxDailySpendBps) / BPS_DENOMINATOR;
        uint256 totalAfter = _dailySpentAmount + spendAmount;
        if (totalAfter > dailyCap) {
            revert TreasuryInvariant_DailySpendExceedsLimit(totalAfter, dailyCap);
        }
        _dailySpentAmount = totalAfter;
    }

    // ─── Governance-only parameter updates ───────────────────────────────────

    /// @notice Update the max single buyback limit (governance only).
    ///         Must be called via the governance executor after timelock.
    /// @dev Override to add governance access control.
    function _setMaxBuybackBps(uint256 newBps) internal virtual {
        require(newBps <= 2000, "TreasuryInvariant: buyback cap cannot exceed 20%");
        emit TreasuryParamUpdated("maxSingleBuybackBps", _maxSingleBuybackBps, newBps, msg.sender);
        _maxSingleBuybackBps = newBps;
    }

    function _setMaxBurnBps(uint256 newBps) internal virtual {
        require(newBps <= 1000, "TreasuryInvariant: burn cap cannot exceed 10%");
        emit TreasuryParamUpdated("maxSingleBurnBps", _maxSingleBurnBps, newBps, msg.sender);
        _maxSingleBurnBps = newBps;
    }

    function _setMinReserveBps(uint256 newBps) internal virtual {
        require(newBps >= 500, "TreasuryInvariant: reserve floor must be at least 5%");
        emit TreasuryParamUpdated("minReserveBps", _minReserveBps, newBps, msg.sender);
        _minReserveBps = newBps;
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    /// @notice Returns current constitutional treasury bounds.
    function treasuryBounds() external view returns (
        uint256 maxSingleBuybackBps,
        uint256 maxSingleBurnBps,
        uint256 minReserveBps,
        uint256 maxDailySpendBps
    ) {
        return (_maxSingleBuybackBps, _maxSingleBurnBps, _minReserveBps, _maxDailySpendBps);
    }

    /// @notice Returns GST unit constant for external integrations.
    function gstUnit() external pure returns (uint256) {
        return GST_UNIT;
    }
}
