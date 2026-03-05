// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/constitutional/TreasuryInvariant.sol";

/// @dev Concrete harness for abstract TreasuryInvariant
contract TreasuryInvariantHarness is TreasuryInvariant {
    function assertBuyback(uint256 amount, uint256 supply) external {
        _assertBuybackBound(amount, supply);
    }
    function assertBurn(uint256 amount, uint256 supply) external {
        _assertBurnBound(amount, supply);
    }
    function assertReserveMinimum(uint256 reserveAfter, uint256 supply) external view {
        _assertReserveMinimum(reserveAfter, supply);
    }
    function assertDailySpend(uint256 amount, uint256 treasuryBalance) external {
        _assertAndRecordDailySpend(amount, treasuryBalance);
    }
    function setMaxBuybackBps(uint256 bps) external {
        _setMaxBuybackBps(bps);
    }
    function setMaxBurnBps(uint256 bps) external {
        _setMaxBurnBps(bps);
    }
    function setMinReserveBps(uint256 bps) external {
        _setMinReserveBps(bps);
    }
}

contract TreasuryInvariantTest is Test {
    TreasuryInvariantHarness ti;

    uint256 constant SUPPLY = 100_000_000 * 1e18; // 100M GST

    function setUp() public {
        ti = new TreasuryInvariantHarness();
    }

    // ─── Buyback bounds ───────────────────────────────────────────────────────

    function test_buyback_within_limit_passes() public {
        // 5% of supply = 5M GST
        ti.assertBuyback(5_000_000 * 1e18, SUPPLY);
    }

    function test_buyback_at_limit_passes() public {
        uint256 maxBuyback = (SUPPLY * 500) / 10_000; // 5%
        ti.assertBuyback(maxBuyback, SUPPLY);
    }

    function test_buyback_exceeds_limit_reverts() public {
        uint256 overLimit = (SUPPLY * 501) / 10_000; // 5.01%
        uint256 maxAllowed = (SUPPLY * 500) / 10_000;
        vm.expectRevert(abi.encodeWithSelector(
            TreasuryInvariant.TreasuryInvariant_BuybackExceedsLimit.selector,
            overLimit,
            maxAllowed
        ));
        ti.assertBuyback(overLimit, SUPPLY);
    }

    function test_buyback_zero_supply_reverts() public {
        vm.expectRevert(TreasuryInvariant.TreasuryInvariant_ZeroSupply.selector);
        ti.assertBuyback(1e18, 0);
    }

    // ─── Burn bounds ──────────────────────────────────────────────────────────

    function test_burn_within_limit_passes() public {
        ti.assertBurn(1_000_000 * 1e18, SUPPLY); // 1% of 100M
    }

    function test_burn_at_limit_passes() public {
        uint256 maxBurn = (SUPPLY * 200) / 10_000; // 2%
        ti.assertBurn(maxBurn, SUPPLY);
    }

    function test_burn_exceeds_limit_reverts() public {
        uint256 overLimit = (SUPPLY * 201) / 10_000; // 2.01%
        uint256 maxAllowed = (SUPPLY * 200) / 10_000;
        vm.expectRevert(abi.encodeWithSelector(
            TreasuryInvariant.TreasuryInvariant_BurnExceedsLimit.selector,
            overLimit,
            maxAllowed
        ));
        ti.assertBurn(overLimit, SUPPLY);
    }

    // ─── Reserve minimum ──────────────────────────────────────────────────────

    function test_reserve_above_minimum_passes() public view {
        uint256 minReserve = (SUPPLY * 1000) / 10_000; // 10%
        ti.assertReserveMinimum(minReserve, SUPPLY);
    }

    function test_reserve_exactly_at_minimum_passes() public view {
        uint256 minReserve = (SUPPLY * 1000) / 10_000;
        ti.assertReserveMinimum(minReserve, SUPPLY);
    }

    function test_reserve_below_minimum_reverts() public {
        uint256 belowMin = (SUPPLY * 999) / 10_000; // just below 10%
        uint256 minRequired = (SUPPLY * 1000) / 10_000;
        vm.expectRevert(abi.encodeWithSelector(
            TreasuryInvariant.TreasuryInvariant_ReserveBelowMinimum.selector,
            belowMin,
            minRequired
        ));
        ti.assertReserveMinimum(belowMin, SUPPLY);
    }

    // ─── Daily spend ──────────────────────────────────────────────────────────

    function test_daily_spend_within_cap_passes() public {
        uint256 treasury = 10_000_000 * 1e18; // 10M GST treasury
        uint256 dailyCap = (treasury * 1000) / 10_000; // 10% = 1M GST
        ti.assertDailySpend(dailyCap / 2, treasury); // spend 500K — fine
    }

    function test_daily_spend_at_cap_passes() public {
        uint256 treasury = 10_000_000 * 1e18;
        uint256 dailyCap = (treasury * 1000) / 10_000;
        ti.assertDailySpend(dailyCap, treasury);
    }

    function test_daily_spend_exceeds_cap_reverts() public {
        uint256 treasury = 10_000_000 * 1e18;
        uint256 dailyCap = (treasury * 1000) / 10_000;
        ti.assertDailySpend(dailyCap, treasury); // use up full cap
        vm.expectRevert(); // next spend must fail
        ti.assertDailySpend(1, treasury);
    }

    function test_daily_spend_resets_next_day() public {
        uint256 treasury = 10_000_000 * 1e18;
        uint256 dailyCap = (treasury * 1000) / 10_000;
        ti.assertDailySpend(dailyCap, treasury); // exhaust today
        vm.warp(block.timestamp + 86400 + 1); // next day
        ti.assertDailySpend(dailyCap, treasury); // should succeed again
    }

    // ─── Param governance ─────────────────────────────────────────────────────

    function test_setMaxBuybackBps_updates() public {
        ti.setMaxBuybackBps(300); // lower to 3%
        (uint256 bps, , , ) = ti.treasuryBounds();
        assertEq(bps, 300);
    }

    function test_setMaxBuybackBps_over_20pct_reverts() public {
        vm.expectRevert();
        ti.setMaxBuybackBps(2001); // > 20%
    }

    function test_setMinReserveBps_below_5pct_reverts() public {
        vm.expectRevert();
        ti.setMinReserveBps(499); // < 5%
    }

    // ─── gstUnit view ─────────────────────────────────────────────────────────

    function test_gstUnit() public view {
        assertEq(ti.gstUnit(), 1e18);
    }
}
