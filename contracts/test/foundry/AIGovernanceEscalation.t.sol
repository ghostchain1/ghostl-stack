// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/ai/AIGovernanceEscalation.sol";

contract AIGovernanceEscalationTest is TestBase {
    AIGovernanceEscalation private escalation;

    function setUp() public {
        escalation = new AIGovernanceEscalation(address(this), address(0));
        escalation.setSubmitter(address(this), true);
        escalation.setThresholds(8000, 8000);
        escalation.setLimits(0, 1 days, 2);
    }

    function testRejectBelowThreshold() public {
        (bytes32 intentId, bool accepted) = escalation.submitIntent(
            bytes32("bundle"),
            1000,
            9000,
            address(0xBEEF),
            0,
            abi.encode(uint256(1))
        );
        assertTrue(!accepted, "should reject");
        assertTrue(intentId == bytes32(0), "intent id should be zero");
    }

    function testAcceptAboveThreshold() public {
        (bytes32 intentId, bool accepted) = escalation.submitIntent(
            bytes32("bundle"),
            9000,
            9000,
            address(0xBEEF),
            0,
            abi.encode(uint256(1))
        );
        assertTrue(accepted, "should accept");
        assertTrue(escalation.intentExists(intentId), "intent missing");
    }

    function testOnlySubmitter() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert(abi.encodeWithSelector(AIGovernanceEscalation.NotSubmitter.selector));
        escalation.submitIntent(bytes32("bundle"), 9000, 9000, address(0xBEEF), 0, abi.encode(uint256(1)));
    }
}
