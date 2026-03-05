// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/constitutional/RoutingLaw.sol";

/// @dev Concrete test harness for the abstract RoutingLaw
contract RoutingLawHarness is RoutingLaw {
    function assertRoutingLaw(uint256 src, uint256 dst) external {
        _assertRoutingLaw(src, dst);
    }
    function assertExternalEgressFromL1(uint256 src) external pure {
        _assertExternalEgressFromL1(src);
    }
}

contract RoutingLawTest is Test {
    RoutingLawHarness rl;

    uint256 constant L1 = 14000101;
    uint256 constant L2 = 901;
    uint256 constant L3 = 903;
    uint256 constant EXTERNAL = 1; // mainnet ETH — not a GhostChain chain

    function setUp() public {
        rl = new RoutingLawHarness();
    }

    // ─── Valid routes ─────────────────────────────────────────────────────────

    function test_L2_to_L1_valid() public {
        rl.assertRoutingLaw(L2, L1);
    }

    function test_L3_to_L2_valid() public {
        rl.assertRoutingLaw(L3, L2);
    }

    function test_L1_to_L2_valid() public {
        rl.assertRoutingLaw(L1, L2);
    }

    function test_L1_to_external_valid() public {
        // L1 may route to any destination (including external)
        rl.assertRoutingLaw(L1, EXTERNAL);
    }

    function test_isValidRoute_L2_to_L1() public view {
        assertTrue(rl.isValidRoute(L2, L1));
    }

    function test_isValidRoute_L3_to_L2() public view {
        assertTrue(rl.isValidRoute(L3, L2));
    }

    // ─── Constitutional violations ────────────────────────────────────────────

    function test_L3_to_L1_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(
            RoutingLaw.RoutingLawViolation_L3ToL1Bypass.selector,
            L3, L1
        ));
        rl.assertRoutingLaw(L3, L1);
    }

    function test_L3_to_external_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(
            RoutingLaw.RoutingLawViolation_L3ToL1Bypass.selector,
            L3, EXTERNAL
        ));
        rl.assertRoutingLaw(L3, EXTERNAL);
    }

    function test_unknown_source_chain_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(
            RoutingLaw.RoutingLawViolation_UnknownChain.selector,
            9999
        ));
        rl.assertRoutingLaw(9999, L1);
    }

    function test_external_egress_from_L2_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(
            RoutingLaw.RoutingLawViolation_ExternalEgressNotFromL1.selector,
            L2
        ));
        rl.assertExternalEgressFromL1(L2);
    }

    function test_external_egress_from_L3_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(
            RoutingLaw.RoutingLawViolation_ExternalEgressNotFromL1.selector,
            L3
        ));
        rl.assertExternalEgressFromL1(L3);
    }

    function test_external_egress_from_L1_valid() public view {
        rl.assertExternalEgressFromL1(L1); // should not revert
    }

    // ─── isValidRoute view ────────────────────────────────────────────────────

    function test_isValidRoute_L3_to_L1_false() public view {
        assertFalse(rl.isValidRoute(L3, L1));
    }

    function test_isValidRoute_unknown_source_false() public view {
        assertFalse(rl.isValidRoute(9999, L1));
    }

    function test_isValidRoute_L3_to_external_false() public view {
        assertFalse(rl.isValidRoute(L3, EXTERNAL));
    }
}
