// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ValidatorComplianceRegistry.sol";

contract ValidatorComplianceRegistryTest is Test {
    ValidatorComplianceRegistry registry;
    address owner = address(0xA11CE);
    address validator = address(0xBEEF);

    function setUp() public {
        registry = new ValidatorComplianceRegistry(owner);
    }

    function testOwnerCanSetScore() public {
        vm.prank(owner);
        registry.setScore(validator, 90, keccak256("policy"));
        (uint8 score,,) = registry.getScore(validator);
        assertEq(score, 90);
    }

    function testNonOwnerCannotSetScore() public {
        vm.expectRevert();
        registry.setScore(validator, 90, keccak256("policy"));
    }
}
