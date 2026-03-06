// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/treasury/federation/FederationRegistry.sol";

contract FederationRegistryLifecycleTest is TestBase {
    address private constant GOVERNOR = address(0xA11CE);
    address private constant TIMELOCK = address(0xBEEF);
    bytes32 private constant MEMBER_ID = keccak256("member:europe-west");

    FederationRegistry private registry;

    function setUp() public {
        registry = new FederationRegistry(GOVERNOR, TIMELOCK);
    }

    function testMembershipLifecycleAndCompliance() public {
        vm.prank(GOVERNOR);
        registry.upsertMember(MEMBER_ID, address(0x1234), keccak256("meta"), 7200, 3500, 1200);

        vm.prank(GOVERNOR);
        registry.setMemberAllowedChain(MEMBER_ID, 14000101, true);

        bool compliant = registry.isMemberCompliant(MEMBER_ID, 14000101, 3000, 5000);
        assertTrue(compliant, "member should be compliant");

        vm.prank(GOVERNOR);
        registry.setMemberStatus(MEMBER_ID, FederationRegistry.MemberStatus.SUSPENDED);

        bool nonCompliant = registry.isMemberCompliant(MEMBER_ID, 14000101, 3000, 5000);
        assertTrue(!nonCompliant, "suspended member must fail");
    }
}
