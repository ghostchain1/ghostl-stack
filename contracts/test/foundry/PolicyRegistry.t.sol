// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/governance/PolicyRegistry.sol";

contract PolicyRegistryTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);
    address private constant ATTACKER = address(0xD00D);
    bytes32 private constant CONSTITUTION = keccak256("ghost.constitution");
    bytes32 private constant POLICY_KEY = keccak256("ghost.policy.gas.max");

    function testPolicyQueueActivateEmergency() public {
        PolicyRegistry registry = new PolicyRegistry(GOVERNOR, TIMELOCK, CONSTITUTION);

        vm.prank(GOVERNOR);
        registry.setPolicySetting(POLICY_KEY, 1, 100, 60, 120, 300, true, true);

        vm.prank(ATTACKER);
        vm.expectRevert(bytes("NOT_EXECUTOR"));
        registry.queuePolicy(POLICY_KEY, 10, keccak256("evidence"));

        vm.prank(GOVERNOR);
        registry.queuePolicy(POLICY_KEY, 10, keccak256("evidence"));

        vm.prank(GOVERNOR);
        vm.expectRevert();
        registry.activatePolicy(POLICY_KEY);

        vm.warp(block.timestamp + 61);
        vm.prank(GOVERNOR);
        registry.activatePolicy(POLICY_KEY);

        (PolicyRegistry.PolicyValue memory current,,) = registry.getPolicy(POLICY_KEY);
        assertEq(current.value, 10, "current value");
        assertEq(uint256(current.version), 1, "version");

        vm.prank(GOVERNOR);
        registry.setEmergencyPolicy(POLICY_KEY, 50, keccak256("emergency"));

        (uint256 value,, bool emergency,,) = registry.effectivePolicy(POLICY_KEY);
        assertTrue(emergency, "emergency active");
        assertEq(value, 50, "emergency value");

        vm.warp(block.timestamp + 121);
        (value,, emergency,,) = registry.effectivePolicy(POLICY_KEY);
        assertTrue(!emergency, "emergency expired");
        assertEq(value, 10, "fallback value");
    }
}
