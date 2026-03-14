// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/treasury/SovereignTreasuryEngine.sol";
import "../../src/treasury/SovereignL2RevenueRouter.sol";

contract MockL1Treasury {
    uint256 public totalReceivedWei;

    function depositRevenueFromL2(uint256 amountWei) external {
        totalReceivedWei += amountWei;
    }
}

contract SovereignFeeRoutingTest is TestBase {
    uint8 private constant SOURCE_L2 = 2;
    uint8 private constant SOURCE_L3 = 3;

    address private constant GOVERNOR = address(0xB0B);
    address private constant L3_APP = address(0xA11CE);
    address private constant L2_EXCHANGE = address(0xCAFE);
    address private constant OUTSIDER = address(0xDEAD);

    function testL3MustRouteThroughL2BeforeL1() public {
        MockL1Treasury sink = new MockL1Treasury();
        SovereignL2RevenueRouter router =
            new SovereignL2RevenueRouter(GOVERNOR, address(0), block.chainid, address(sink));
        SovereignTreasuryEngine treasury =
            new SovereignTreasuryEngine(GOVERNOR, address(0), block.chainid, 901, address(router));

        vm.prank(GOVERNOR);
        router.setSourceAuthorization(L3_APP, SOURCE_L3, true);

        // Direct L3 -> L1 treasury bypass must fail.
        vm.prank(L3_APP);
        vm.expectRevert(bytes("only_l2_aggregator"));
        treasury.depositRevenueFromL2(100_000);

        // Route through canonical L2 router.
        vm.prank(L3_APP);
        router.recordL3Revenue(100_000, keccak256("l3:streaming:1"));
        assertEq(router.pendingRevenueWei(), 100_000, "pending mismatch");

        // Governance metadata is mandatory for forwarding.
        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("governance_proposal_required"));
        router.forwardRevenueToL1(100_000, "");
    }

    function testGovernanceOnlyForwardingAndAccounting() public {
        SovereignL2RevenueRouter router;
        MockL1Treasury sink;
        (router, sink) = _deployRoutingStack();

        vm.prank(GOVERNOR);
        router.setSourceAuthorization(L3_APP, SOURCE_L3, true);
        vm.prank(GOVERNOR);
        router.setSourceAuthorization(L2_EXCHANGE, SOURCE_L2, true);

        vm.prank(L3_APP);
        router.recordL3Revenue(70_000, keccak256("l3:fees:1"));
        vm.prank(L2_EXCHANGE);
        router.recordL2Revenue(30_000, keccak256("l2:trading:1"));

        assertEq(router.pendingRevenueWei(), 100_000, "pending mismatch");
        assertEq(router.totalL3RevenueWei(), 70_000, "l3 total mismatch");
        assertEq(router.totalL2RevenueWei(), 30_000, "l2 total mismatch");

        vm.prank(OUTSIDER);
        vm.expectRevert(bytes("NOT_EXECUTOR"));
        router.forwardRevenueToL1(100_000, "GOV-ROUTE-1");

        vm.prank(GOVERNOR);
        router.forwardRevenueToL1(100_000, "GOV-ROUTE-1");

        assertEq(router.pendingRevenueWei(), 0, "pending should be drained");
        assertEq(router.totalForwardedToL1Wei(), 100_000, "forwarded mismatch");
        assertEq(sink.totalReceivedWei(), 100_000, "sink revenue mismatch");
    }

    function testUnauthorizedSourcesAndRoutingFlags() public {
        SovereignL2RevenueRouter router;
        MockL1Treasury sink;
        (router, sink) = _deployRoutingStack();
        sink;

        vm.prank(L3_APP);
        vm.expectRevert(bytes("only_authorized_l3_source"));
        router.recordL3Revenue(1, bytes32(0));

        vm.prank(L2_EXCHANGE);
        vm.expectRevert(bytes("only_authorized_l2_source"));
        router.recordL2Revenue(1, bytes32(0));

        vm.prank(GOVERNOR);
        router.setSourceAuthorization(L3_APP, SOURCE_L3, true);
        vm.prank(GOVERNOR);
        router.setRoutingFlags(false, true);

        vm.prank(L3_APP);
        vm.expectRevert(bytes("routing_paused"));
        router.recordL3Revenue(1, bytes32(0));

        vm.prank(GOVERNOR);
        router.setRoutingFlags(true, false);

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("emergency_halt"));
        router.forwardRevenueToL1(1, "GOV-ROUTE-2");
    }

    function _deployRoutingStack() internal returns (SovereignL2RevenueRouter router, MockL1Treasury sink) {
        sink = new MockL1Treasury();
        router = new SovereignL2RevenueRouter(GOVERNOR, address(0), block.chainid, address(sink));
    }
}
