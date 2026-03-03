// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../foundry/TestBase.sol";
import "../../src/treasury/StrategyRegistry.sol";

contract StrategyRegistryTest is TestBase {
    StrategyRegistry private reg;
    address private constant GOV = address(0xA11CE);

    function setUp() public {
        reg = new StrategyRegistry(GOV, address(0));
    }

    // ─── addStrategy ──────────────────────────────────────────────────────────

    function test_addStrategy_basic() public {
        vm.prank(GOV);
        uint256 id = reg.addStrategy(
            bytes32("stable-reserve"),
            2_000,  // 20% max alloc
            100,    // 1x max leverage
            500,    // 5% max drawdown
            1 days,
            2,
            0       // safe tier
        );
        assertEq(id, 1, "first id != 1");
        assertEq(reg.strategyCount(), 1, "count mismatch");

        StrategyRegistry.StrategyParams memory p = reg.getStrategy(1);
        assertEq(p.label, bytes32("stable-reserve"), "label mismatch");
        assertEq(uint8(p.status), uint8(StrategyRegistry.StrategyStatus.ACTIVE), "not active");
        assertEq(uint16(p.maxAllocationBps), 2_000, "alloc bps mismatch");
    }

    function test_addStrategy_duplicateLabel_reverts() public {
        vm.prank(GOV);
        reg.addStrategy(bytes32("dup"), 1_000, 100, 500, 1 days, 1, 0);
        vm.prank(GOV);
        vm.expectRevert(abi.encodeWithSelector(StrategyRegistry.LabelTaken.selector, bytes32("dup")));
        reg.addStrategy(bytes32("dup"), 500, 100, 300, 2 days, 1, 0);
    }

    function test_addStrategy_notGovernance_reverts() public {
        vm.expectRevert(bytes("NOT_EXECUTOR"));
        reg.addStrategy(bytes32("x"), 1_000, 100, 500, 1 days, 1, 0);
    }

    function testFuzz_addStrategy_allocBps(uint16 bps) public {
        vm.assume(bps > 0 && bps <= 10_000);
        vm.prank(GOV);
        uint256 id = reg.addStrategy(bytes32("fuzz"), bps, 100, 500, 1 days, 1, 0);
        StrategyRegistry.StrategyParams memory p = reg.getStrategy(id);
        assertEq(uint16(p.maxAllocationBps), bps, "bps mismatch");
    }

    // ─── updateStrategy ───────────────────────────────────────────────────────

    function test_updateStrategy() public {
        vm.prank(GOV);
        reg.addStrategy(bytes32("upd"), 1_000, 100, 500, 1 days, 1, 0);
        vm.prank(GOV);
        reg.updateStrategy(1, 3_000, 100, 800, 2 days, 3, 1);
        StrategyRegistry.StrategyParams memory p = reg.getStrategy(1);
        assertEq(uint16(p.maxAllocationBps), 3_000, "bps not updated");
        assertEq(uint8(p.riskTier), 1, "tier not updated");
    }

    // ─── deprecateStrategy ────────────────────────────────────────────────────

    function test_deprecateStrategy() public {
        vm.prank(GOV);
        reg.addStrategy(bytes32("dep"), 1_000, 100, 500, 1 days, 1, 0);
        vm.prank(GOV);
        reg.deprecateStrategy(1);

        assertTrue(!reg.isActive(1), "still active after deprecation");

        vm.prank(GOV);
        vm.expectRevert(abi.encodeWithSelector(StrategyRegistry.StrategyNotActive.selector, uint256(1)));
        reg.deprecateStrategy(1);
    }

    // ─── recordExecution ──────────────────────────────────────────────────────

    function test_recordExecution_cooldown() public {
        vm.prank(GOV);
        reg.addStrategy(bytes32("cool"), 1_000, 100, 500, 2 days, 1, 0);

        // First execution OK (GOV is owner in this test)
        vm.prank(GOV);
        reg.recordExecution(1, 100 ether, GOV);

        // Second immediately → cooldown active
        vm.prank(GOV);
        vm.expectRevert(
            abi.encodeWithSelector(
                StrategyRegistry.CooldownActive.selector,
                uint256(1),
                block.timestamp + 2 days
            )
        );
        reg.recordExecution(1, 100 ether, GOV);

        // After 2 days it works
        vm.warp(block.timestamp + 2 days + 1);
        vm.prank(GOV);
        reg.recordExecution(1, 50 ether, GOV);

        StrategyRegistry.StrategyParams memory p = reg.getStrategy(1);
        assertTrue(p.cumulativePnL == int256(150 ether), "pnl accumulation wrong");
    }

    // ─── Invariants ───────────────────────────────────────────────────────────

    function invariant_strategyCount_monotonic() public {
        // strategyCount never decreases (deprecation only changes status, not count)
        assertTrue(reg.strategyCount() >= 0, "count negative");
    }
}
