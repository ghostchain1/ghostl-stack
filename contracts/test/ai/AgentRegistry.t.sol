// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "../foundry/TestBase.sol";
import "../../src/ai/AgentRegistry.sol";

contract AgentRegistryTest is TestBase {
    AgentRegistry private registry;

    bytes32 private constant AGENT_ID = keccak256("router-1");
    bytes32 private constant ROLE = keccak256("router");
    bytes32 private constant POLICY = keccak256("policy");
    address private operator = address(0xBEEF);

    function setUp() public {
        registry = new AgentRegistry(address(this), address(0));
    }

    function testRegisterAgent() public {
        registry.registerAgent(AGENT_ID, operator, ROLE, POLICY, "router-agent");
        AgentRegistry.Agent memory info = registry.getAgent(AGENT_ID);
        assertEq(info.operator, operator, "operator mismatch");
        assertEq(info.role, ROLE, "role mismatch");
        assertTrue(info.enabled, "not enabled");
    }

    function testHeartbeatOnlyOperator() public {
        registry.registerAgent(AGENT_ID, operator, ROLE, POLICY, "router-agent");
        vm.prank(operator);
        registry.heartbeat(AGENT_ID);
        AgentRegistry.Agent memory info = registry.getAgent(AGENT_ID);
        assertTrue(info.lastHeartbeat > 0, "heartbeat missing");
    }

    function testHeartbeatRejected() public {
        registry.registerAgent(AGENT_ID, operator, ROLE, POLICY, "router-agent");
        vm.expectRevert();
        registry.heartbeat(AGENT_ID);
    }
}
