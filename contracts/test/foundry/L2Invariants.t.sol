// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/ai/AgentGovernancePolicy.sol";

contract L2Invariants is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);
    address private constant EXECUTOR = address(0xCAFE);
    address private constant ATTACKER = address(0xD00D);

    function testPolicyRegistryGovernanceOnly() public {
        AgentGovernancePolicy registry = new AgentGovernancePolicy(GOVERNOR, TIMELOCK);
        bytes32 role = keccak256("L2_AI_MONITOR");
        bytes32 action = keccak256("L2_AI_THROTTLE");
        bytes32 policyHash = keccak256("policy");

        vm.prank(ATTACKER);
        vm.expectRevert(bytes("NOT_EXECUTOR"));
        registry.setRolePolicy(role, policyHash, true);

        vm.prank(GOVERNOR);
        registry.setRolePolicy(role, policyHash, true);

        vm.prank(ATTACKER);
        vm.expectRevert(bytes("NOT_EXECUTOR"));
        registry.setActionPolicy(role, action, true, 1, 60, 0, false, keccak256("L2"), bytes32(0));

        vm.prank(TIMELOCK);
        registry.setActionPolicy(role, action, true, 1, 60, 0, false, keccak256("L2"), bytes32(0));
    }

    function testPolicyRegistryCanExecuteAndCooldown() public {
        AgentGovernancePolicy registry = new AgentGovernancePolicy(GOVERNOR, TIMELOCK);
        bytes32 role = keccak256("L2_AI_MONITOR");
        bytes32 action = keccak256("L2_AI_PAUSE");
        bytes32 policyHash = keccak256("policy");

        vm.prank(GOVERNOR);
        registry.setRolePolicy(role, policyHash, true);
        vm.prank(GOVERNOR);
        registry.setActionPolicy(role, action, true, 1, 120, 1, true, keccak256("L2"), bytes32(0));
        vm.prank(GOVERNOR);
        registry.setExecutor(EXECUTOR, true);

        assertTrue(!registry.canExecute(role, action, 0, false), "missing approvals/evidence");
        assertTrue(!registry.canExecute(role, action, 1, false), "missing evidence");
        assertTrue(registry.canExecute(role, action, 1, true), "allowed with approval+evidence");

        vm.prank(EXECUTOR);
        registry.recordAction(role, action);

        assertTrue(!registry.canExecute(role, action, 1, true), "cooldown enforced");
        vm.warp(block.timestamp + 121);
        assertTrue(registry.canExecute(role, action, 1, true), "cooldown elapsed");
    }
}
