// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../foundry/TestBase.sol";
import "../../src/treasury/StrategyRegistry.sol";
import "../../src/treasury/RiskEngine.sol";

contract RiskEngineTest is TestBase {
    StrategyRegistry private reg;
    RiskEngine       private risk;
    address private constant GOV = address(0xA11CE);

    uint256 private constant INITIAL_NAV      = 10_000 ether;
    uint256 private constant MIN_STABLE       = 1_000 ether;
    uint256 private constant MAX_DAILY_VAR    = 500 ether;
    uint256 private constant MAX_WEEKLY_LOSS  = 1_500 ether;

    function setUp() public {
        reg = new StrategyRegistry(GOV, address(0));

        RiskEngine.RiskConfig memory cfg = RiskEngine.RiskConfig({
            minStableReserve:            MIN_STABLE,
            maxDailyVaR:                 MAX_DAILY_VAR,
            maxWeeklyLoss:               MAX_WEEKLY_LOSS,
            maxAssetConcentrationBps:    3_000,  // 30%
            maxStrategyConcentrationBps: 2_000,  // 20%
            stressMultiplierBps:         10_000, // no stress penalty
            circuitBreakerOpen:          false
        });

        risk = new RiskEngine(GOV, address(0), reg, cfg);
        vm.prank(GOV);
        risk.updateNAV(INITIAL_NAV);

        // Register a strategy
        vm.prank(GOV);
        reg.addStrategy(bytes32("stable-reserve"), 2_000, 100, 500, 1 days, 1, 0);
    }

    // ─── checkExecution happy path ────────────────────────────────────────────

    function test_checkExecution_passes() public {
        bool ok = risk.checkExecution(
            1,
            100 ether,        // amount
            2_000 ether,      // stable reserve after (> 1_000)
            500 ether         // asset alloc (well under 30% of 10k)
        );
        assertTrue(ok, "check should pass");
    }

    // ─── Reserve breach ───────────────────────────────────────────────────────

    function test_checkExecution_reserveBreach_reverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(RiskEngine.ReserveBreached.selector, 999 ether, MIN_STABLE)
        );
        risk.checkExecution(1, 100 ether, 999 ether, 0);
    }

    // ─── Concentration breach ─────────────────────────────────────────────────

    function test_checkExecution_stratConcentration_reverts() public {
        // 2_000 bps = 20% of 10_000 ETH = 2_000 ETH.
        // Already allocated 1_800 ETH, trying to add 300 ETH → 2_100 > 2_000.
        vm.prank(GOV);
        risk.recordEntry(1, 1_800 ether);
        vm.expectRevert();  // StrategyConcentrationBreached
        risk.checkExecution(1, 300 ether, 2_000 ether, 0);
    }

    // ─── Daily VaR breach ────────────────────────────────────────────────────

    function test_checkExecution_dailyVaR_reverts() public {
        // Record 400 ether loss first; then propose 200 ether → 600 > 500 limit
        vm.prank(GOV);
        risk.recordLoss(1, 400 ether);
        vm.expectRevert();  // DailyVaRBreached
        risk.checkExecution(1, 200 ether, 2_000 ether, 0);
    }

    // ─── Weekly loss circuit breaker ─────────────────────────────────────────

    function test_weeklyLoss_tripsCircuitBreaker() public {
        vm.prank(GOV);
        risk.recordLoss(1, 1_500 ether);
        (, , , , , , bool cbOpen) = risk.config();
        assertTrue(cbOpen, "breaker should be open");

        vm.expectRevert(RiskEngine.CircuitBreakerActive.selector);
        risk.checkExecution(1, 1 ether, 2_000 ether, 0);
    }

    // ─── Circuit breaker reset ────────────────────────────────────────────────

    function test_resetCircuitBreaker() public {
        vm.prank(GOV);
        risk.openCircuitBreaker("test");
        vm.prank(GOV);
        risk.resetCircuitBreaker();
        (, , , , , , bool cbOpen) = risk.config();
        assertTrue(!cbOpen, "breaker still open");
        assertEq(risk.currentDailyLoss(), 0, "daily loss not cleared");
        assertEq(risk.currentWeeklyLoss(), 0, "weekly loss not cleared");
    }

    // ─── Window rolling ───────────────────────────────────────────────────────

    function test_dailyLoss_rolls_after_24h() public {
        vm.prank(GOV);
        risk.recordLoss(1, 400 ether);
        assertEq(risk.currentDailyLoss(), 400 ether, "loss not recorded");

        vm.warp(block.timestamp + 1 days + 1);
        assertEq(risk.currentDailyLoss(), 0, "loss should have rolled");
    }

    // ─── Fuzz ────────────────────────────────────────────────────────────────

    function testFuzz_checkExecution_reserveRange(uint256 reserve) public {
        vm.assume(reserve >= MIN_STABLE && reserve <= INITIAL_NAV);
        bool ok = risk.checkExecution(1, 1 ether, reserve, 0);
        assertTrue(ok, "should pass when reserve >= min");
    }
}
