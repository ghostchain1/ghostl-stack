// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/econ/GhostEconomicEngine.sol";

contract GhostEconomicRoutingTest is TestBase {
    address private constant GOVERNOR = address(0xA11CE);
    address private constant TIMELOCK = address(0xB0B);

    address private constant L3_COLLECTOR = address(0xC001);
    address private constant L2_COLLECTOR = address(0xC002);
    address private constant ATTACKER = address(0xBAD1);

    L1TreasuryReceiver private l1Receiver;
    L2FeeRouter private l2Router;
    L3FeeRouter private l3Router;
    SupplyAndFlowOracle private oracle;

    function setUp() public {
        oracle = new SupplyAndFlowOracle(GOVERNOR, TIMELOCK);

        l1Receiver = new L1TreasuryReceiver(GOVERNOR, TIMELOCK, block.chainid);
        l2Router = new L2FeeRouter(GOVERNOR, TIMELOCK, block.chainid, address(l1Receiver));
        l3Router = new L3FeeRouter(GOVERNOR, TIMELOCK, block.chainid, address(l2Router));

        vm.prank(GOVERNOR);
        l1Receiver.setL2FeeRouter(address(l2Router));

        vm.prank(GOVERNOR);
        l2Router.setL3FeeRouter(address(l3Router));

        vm.prank(GOVERNOR);
        l2Router.setL2Collector(L2_COLLECTOR, true);

        vm.prank(GOVERNOR);
        l3Router.setL3Collector(L3_COLLECTOR, true);

        vm.prank(GOVERNOR);
        l2Router.setSupplyAndFlowOracle(address(oracle));

        vm.prank(GOVERNOR);
        oracle.setReporter(address(l2Router), true);
    }

    function testRoutingLaw_L3ToL2ToL1Only() public {
        bytes32 refL3 = keccak256("l3-fee-1");
        bytes32 refL1 = keccak256("forward-1");

        vm.prank(L3_COLLECTOR);
        l3Router.captureFees(100_000, refL3);

        vm.prank(GOVERNOR);
        l3Router.forwardToL2(100_000, refL1);

        assertEq(l2Router.pendingL2NativeFeesWei(), 100_000, "l2 pending mismatch");

        vm.prank(GOVERNOR);
        l2Router.forwardToL1(100_000, refL1);

        assertEq(l2Router.pendingL2NativeFeesWei(), 0, "l2 pending should be empty");
        assertEq(l1Receiver.totalReceivedFromL2Wei(), 100_000, "l1 receive mismatch");
        assertEq(oracle.totalL3ToL2Wei(), 100_000, "oracle l3->l2 mismatch");
        assertEq(oracle.totalL2ToL1Wei(), 100_000, "oracle l2->l1 mismatch");
    }

    function testBypassFails_DirectL3ToL1() public {
        vm.prank(ATTACKER);
        vm.expectRevert(bytes("only_l2_fee_router"));
        l1Receiver.depositFromL2(1, keccak256("bypass"));
    }

    function testBypassFails_DirectL3IntoL2Router() public {
        vm.prank(ATTACKER);
        vm.expectRevert(bytes("only_l3_fee_router"));
        l2Router.acceptL3Fees(1, keccak256("bypass-l3-l2"));
    }

    function testBypassFails_DirectL2ToL1WithoutPending() public {
        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("insufficient_pending"));
        l2Router.forwardToL1(1, keccak256("no-balance"));
    }

    function testFuzzRoutingLaw_NoBypass(uint96 l3Amount, uint96 l2Amount) public {
        vm.assume(l3Amount > 0);
        vm.assume(l2Amount > 0);

        bytes32 l3Ref = keccak256(abi.encode("l3", l3Amount));
        bytes32 l2Ref = keccak256(abi.encode("l2", l2Amount));
        bytes32 fwdRef = keccak256(abi.encode("fwd", l3Amount, l2Amount));

        vm.prank(L3_COLLECTOR);
        l3Router.captureFees(l3Amount, l3Ref);

        vm.prank(GOVERNOR);
        l3Router.forwardToL2(l3Amount, fwdRef);

        vm.prank(L2_COLLECTOR);
        l2Router.recordL2Fees(l2Amount, l2Ref);

        uint256 pending = l2Router.pendingL2NativeFeesWei();
        assertEq(pending, uint256(l3Amount) + uint256(l2Amount), "pending mismatch");

        vm.prank(GOVERNOR);
        l2Router.forwardToL1(pending, fwdRef);

        assertEq(l2Router.pendingL2NativeFeesWei(), 0, "pending must be zero");
        assertEq(l1Receiver.totalReceivedFromL2Wei(), pending, "l1 must equal forwarded amount");
    }
}
