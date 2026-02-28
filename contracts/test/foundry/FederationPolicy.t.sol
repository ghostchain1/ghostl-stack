// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/federation/FederationPolicy.sol";

contract FederationPolicyTest is TestBase {
    address private constant GOVERNOR = address(0xA11CE);
    address private constant TIMELOCK = address(0xBEEF);
    bytes32 private constant MEMBER_ID = keccak256("member:region-a");
    bytes32 private constant PROTOCOL_ID = keccak256("protocol:validator_staking");
    uint256 private constant CHAIN_ID = 14000101;

    FederationPolicy private policy;

    function setUp() public {
        policy = new FederationPolicy(GOVERNOR, TIMELOCK);
    }

    function _setupActivePolicy() internal {
        vm.prank(GOVERNOR);
        policy.upsertMemberPolicy(MEMBER_ID, keccak256("metadata"), 7500, 4000, 1800, true);

        vm.prank(GOVERNOR);
        policy.setAllowedChain(MEMBER_ID, CHAIN_ID, true);

        vm.prank(GOVERNOR);
        policy.setAllowedProtocol(MEMBER_ID, PROTOCOL_ID, true);
    }

    function testPolicyAllowsCompliantAllocation() public {
        _setupActivePolicy();
        (bool ok, FederationPolicy.ViolationCode code) = policy.checkAllocation(MEMBER_ID, CHAIN_ID, PROTOCOL_ID, 3000, 3000);
        assertTrue(ok, "allocation should be compliant");
        assertEq(uint256(code), uint256(FederationPolicy.ViolationCode.NONE), "violation code mismatch");
    }

    function testPolicyBlocksInactiveMember() public {
        _setupActivePolicy();
        vm.prank(GOVERNOR);
        policy.setMemberStatus(MEMBER_ID, false);

        (bool ok, FederationPolicy.ViolationCode code) = policy.checkAllocation(MEMBER_ID, CHAIN_ID, PROTOCOL_ID, 3000, 3000);
        assertTrue(!ok, "inactive member must be rejected");
        assertEq(uint256(code), uint256(FederationPolicy.ViolationCode.MEMBER_INACTIVE), "unexpected violation");
    }

    function testPolicyBlocksRiskCapViolation() public {
        _setupActivePolicy();
        (bool ok, FederationPolicy.ViolationCode code) = policy.checkAllocation(MEMBER_ID, CHAIN_ID, PROTOCOL_ID, 9000, 3000);
        assertTrue(!ok, "risk cap violation must fail");
        assertEq(uint256(code), uint256(FederationPolicy.ViolationCode.RISK_CAP_EXCEEDED), "unexpected violation");
    }
}
