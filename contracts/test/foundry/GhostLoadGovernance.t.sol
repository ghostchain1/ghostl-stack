// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "src/governance/GhostLoadParameterRegistry.sol";
import "src/governance/GhostLoadEmergencyPause.sol";

contract GhostLoadGovernanceTest is Test {
    GhostLoadParameterRegistry internal registry;
    GhostLoadEmergencyPause internal pauseGuard;

    address internal governance = address(0xA11CE);
    address internal guardian = address(0xB0B);

    bytes32 internal constant KEY_L2_MAX_GWEI = keccak256("feeBands.L2.maxGwei");
    bytes32 internal constant KEY_L3_TARGET_MIN = keccak256("feeBands.L3.targetMinGwei");

    function setUp() public {
        registry = new GhostLoadParameterRegistry(governance, 1 days);
        pauseGuard = new GhostLoadEmergencyPause(guardian);
        registry.setCriticalKey(KEY_L2_MAX_GWEI, true);
        registry.setCriticalKey(KEY_L3_TARGET_MIN, false);
    }

    function testCriticalChangeRequiresGovernanceAndTimelock() public {
        vm.prank(governance);
        registry.queueUpdate(KEY_L2_MAX_GWEI, 50000);

        vm.expectRevert(GhostLoadParameterRegistry.TimelockActive.selector);
        registry.applyUpdate(KEY_L2_MAX_GWEI);

        vm.warp(block.timestamp + 1 days + 1);
        registry.applyUpdate(KEY_L2_MAX_GWEI);

        assertEq(registry.values(KEY_L2_MAX_GWEI), 50000);
    }

    function testNonCriticalAllowsOwnerImmediateApply() public {
        registry.queueUpdate(KEY_L3_TARGET_MIN, 800);
        registry.applyUpdate(KEY_L3_TARGET_MIN);
        assertEq(registry.values(KEY_L3_TARGET_MIN), 800);
    }

    function testEmergencyPauseManualOverride() public {
        assertEq(pauseGuard.paused(), false);
        vm.prank(guardian);
        pauseGuard.pause();
        assertEq(pauseGuard.paused(), true);
        vm.prank(guardian);
        pauseGuard.unpause();
        assertEq(pauseGuard.paused(), false);
    }
}
