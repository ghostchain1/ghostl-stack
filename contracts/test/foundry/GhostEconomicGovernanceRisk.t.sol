// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/econ/GhostEconomicEngine.sol";

contract GhostEconomicGovernanceRiskTest is TestBase {
    address private constant GOVERNOR = address(0xA11CE);
    address private constant TIMELOCK = address(0xB0B);

    address private constant L1_ROUTER = address(0x1001);
    address private constant STRATEGY_VOL = address(0x2001);
    address private constant STRATEGY_STABLE = address(0x2002);
    address private constant REWARDS = address(0x3001);

    RiskPolicyRegistry private risk;
    TreasuryVault private vault;
    DistributionModule private dist;

    function setUp() public {
        risk = new RiskPolicyRegistry(GOVERNOR, TIMELOCK);
        vault = new TreasuryVault(GOVERNOR, TIMELOCK);
        dist = new DistributionModule(GOVERNOR, TIMELOCK, address(vault));

        vm.prank(GOVERNOR);
        vault.setRiskPolicyRegistry(address(risk));

        vm.prank(GOVERNOR);
        risk.setAllocationReporter(address(vault), true);

        vm.prank(GOVERNOR);
        vault.setDistributionModule(address(dist));

        vm.prank(GOVERNOR);
        vault.setL1TreasuryReceiver(L1_ROUTER);

        vm.prank(GOVERNOR);
        risk.setGlobalPolicy(5_000, 2_000, 1 hours, false);

        vm.prank(GOVERNOR);
        risk.setStrategyPolicy(STRATEGY_VOL, true, 5_000, true, 1 hours);

        vm.prank(GOVERNOR);
        risk.setStrategyPolicy(STRATEGY_STABLE, true, 8_000, false, 0);

        vm.prank(L1_ROUTER);
        vault.depositFromL1Router(1_000_000, keccak256("seed"));
    }

    function testOnlyGovernanceCanAllocate() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(bytes("NOT_EXECUTOR"));
        vault.allocateToStrategy(STRATEGY_VOL, 100_000, true, keccak256("alloc1"));
    }

    function testRiskCapAndStableBufferEnforced() public {
        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("strategy_cap_exceeded"));
        vault.allocateToStrategy(STRATEGY_VOL, 600_000, true, keccak256("alloc-too-big"));

        vm.prank(GOVERNOR);
        vault.allocateToStrategy(STRATEGY_VOL, 300_000, true, keccak256("alloc-ok"));

        assertEq(vault.volatileExposureWei(), 300_000, "volatile exposure mismatch");
        assertEq(vault.stableBufferWei(), 700_000, "stable buffer mismatch");

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("cooldown_active"));
        vault.allocateToStrategy(STRATEGY_VOL, 10_000, true, keccak256("alloc-cooldown"));
    }

    function testEmergencyPauseStopsAllocations() public {
        vm.prank(GOVERNOR);
        risk.setGlobalPolicy(5_000, 2_000, 1 hours, true);

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("emergency_pause"));
        vault.allocateToStrategy(STRATEGY_VOL, 100_000, true, keccak256("alloc-paused"));
    }

    function testDistributionGatedByModuleAndGovernance() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(bytes("NOT_EXECUTOR"));
        dist.distributeTo(REWARDS, 10_000, keccak256("d1"));

        vm.prank(GOVERNOR);
        dist.distributeTo(REWARDS, 10_000, keccak256("d2"));

        assertEq(vault.trackedAssetsWei(), 990_000, "assets after distribution mismatch");
        assertEq(vault.stableBufferWei(), 990_000, "stable buffer after distribution mismatch");
    }
}
