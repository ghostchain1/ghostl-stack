// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "../foundry/TestBase.sol";
import "../../src/ai/AgentGovernancePolicy.sol";

contract AgentGovernancePolicyTest is TestBase {
    AgentGovernancePolicy private policy;

    bytes32 private constant ROLE = keccak256("router");
    bytes32 private constant POLICY_HASH = keccak256("policy");
    bytes32 private constant ACTION = keccak256("route.task");

    function setUp() public {
        policy = new AgentGovernancePolicy(address(this), address(0));
    }

    function testRolePolicy() public {
        policy.setRolePolicy(ROLE, POLICY_HASH, true);
        (bytes32 hash, bool enabled, uint64 updatedAt) = policy.rolePolicies(ROLE);
        assertEq(hash, POLICY_HASH, "policy hash mismatch");
        assertTrue(enabled, "role disabled");
        assertTrue(updatedAt > 0, "updatedAt missing");
    }

    function testActionAllowed() public {
        policy.setRolePolicy(ROLE, POLICY_HASH, true);
        policy.setActionAllowed(ROLE, ACTION, true);
        assertTrue(policy.isActionAllowed(ROLE, ACTION), "action not allowed");
    }
}
