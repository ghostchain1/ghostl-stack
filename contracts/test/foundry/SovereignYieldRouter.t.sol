// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/treasury/SovereignTreasuryEngine.sol";
import "../../src/treasury/SovereignYieldRouter.sol";

contract SovereignYieldRouterTest is TestBase {
    uint256 private constant DEST_CHAIN_ID = 90_001;

    address private constant GOVERNOR = address(0xB0B);
    address private constant AGGREGATOR = address(0xA66);
    address private constant ADAPTER = address(0xA11CE);
    address private constant OUTSIDER = address(0xDEAD);

    function testGovernanceLockedAdapterRoutingAndAccounting() public {
        SovereignTreasuryEngine treasury;
        SovereignYieldRouter router;
        (treasury, router) = _deployStack();
        bytes32 allocationId = _queueAndExecuteAllocation(treasury, ADAPTER, 100_000, 2_000);

        vm.prank(GOVERNOR);
        router.setAdapterConfig(DEST_CHAIN_ID, ADAPTER, true, 2_500);
        vm.prank(GOVERNOR);
        router.routeAllocation(allocationId, DEST_CHAIN_ID, ADAPTER, 100_000, 2_000, "GOV-ROUTE-1");

        vm.prank(ADAPTER);
        router.recordAdapterReturn(allocationId, 50_000, 10_000, 600, keccak256("source-tx-1"), "GOV-RETURN-1");

        assertEq(treasury.deployedCapitalWei(), 50_000, "deployed capital mismatch");
        assertEq(treasury.yieldReturnedWei(), 10_000, "yield returned mismatch");
        assertEq(treasury.revenueBalanceWei(), 1_060_000, "revenue balance mismatch");

        (
            uint256 destinationChainId,
            address adapter,
            uint256 deployedAmountWei,
            uint256 principalReturnedWei,
            uint256 yieldReturnedWei_,
            uint16 riskScoreBps,
            bool closed
        ) = router.routedAllocations(allocationId);

        assertEq(destinationChainId, DEST_CHAIN_ID, "destination chain mismatch");
        assertEq(adapter, ADAPTER, "adapter mismatch");
        assertEq(deployedAmountWei, 100_000, "deployed amount mismatch");
        assertEq(principalReturnedWei, 50_000, "principal returned mismatch");
        assertEq(yieldReturnedWei_, 10_000, "yield returned accounting mismatch");
        assertEq(uint256(riskScoreBps), 2_000, "risk score mismatch");
        assertTrue(!closed, "allocation should remain open");
    }

    function testAdapterAuthorizationAndRiskCap() public {
        SovereignTreasuryEngine treasury;
        SovereignYieldRouter router;
        (treasury, router) = _deployStack();
        bytes32 allocationId = _queueAndExecuteAllocation(treasury, ADAPTER, 100_000, 2_000);

        vm.prank(GOVERNOR);
        router.setAdapterConfig(DEST_CHAIN_ID, ADAPTER, true, 1_500);

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("adapter_risk_cap"));
        router.routeAllocation(allocationId, DEST_CHAIN_ID, ADAPTER, 100_000, 2_000, "GOV-ROUTE-2");

        vm.prank(GOVERNOR);
        router.setAdapterConfig(DEST_CHAIN_ID, ADAPTER, true, 2_500);
        vm.prank(GOVERNOR);
        router.routeAllocation(allocationId, DEST_CHAIN_ID, ADAPTER, 100_000, 2_000, "GOV-ROUTE-3");

        vm.prank(OUTSIDER);
        vm.expectRevert(bytes("not_adapter_or_governance"));
        router.recordAdapterReturn(allocationId, 0, 1, 400, keccak256("source-tx-2"), "GOV-RETURN-2");
    }

    function testPrincipalCapAndRouterFlags() public {
        SovereignTreasuryEngine treasury;
        SovereignYieldRouter router;
        (treasury, router) = _deployStack();
        bytes32 allocationId = _queueAndExecuteAllocation(treasury, ADAPTER, 100_000, 2_000);

        vm.prank(GOVERNOR);
        router.setAdapterConfig(DEST_CHAIN_ID, ADAPTER, true, 2_500);
        vm.prank(GOVERNOR);
        router.routeAllocation(allocationId, DEST_CHAIN_ID, ADAPTER, 100_000, 2_000, "GOV-ROUTE-4");

        vm.prank(ADAPTER);
        router.recordAdapterReturn(allocationId, 80_000, 0, 0, keccak256("source-tx-3"), "GOV-RETURN-3");

        vm.prank(ADAPTER);
        vm.expectRevert(bytes("principal_exceeds_deployed"));
        router.recordAdapterReturn(allocationId, 30_000, 0, 0, keccak256("source-tx-4"), "GOV-RETURN-4");

        vm.prank(GOVERNOR);
        router.setRouterFlags(false, true);

        vm.prank(ADAPTER);
        vm.expectRevert(bytes("routing_paused"));
        router.recordAdapterReturn(allocationId, 20_000, 0, 0, keccak256("source-tx-5"), "GOV-RETURN-5");
    }

    function _deployStack() internal returns (SovereignTreasuryEngine treasury, SovereignYieldRouter router) {
        treasury = new SovereignTreasuryEngine(GOVERNOR, address(0), block.chainid, 901, AGGREGATOR);
        router = new SovereignYieldRouter(GOVERNOR, address(0), address(treasury), block.chainid);

        vm.prank(GOVERNOR);
        treasury.setYieldRouter(address(router));
        vm.prank(AGGREGATOR);
        treasury.depositRevenueFromL2(1_000_000);
        vm.prank(GOVERNOR);
        treasury.setMinAllocationDelaySeconds(0);
    }

    function _queueAndExecuteAllocation(SovereignTreasuryEngine treasury, address target, uint256 deployedAmount, uint16 riskScoreBps)
        internal
        returns (bytes32 allocationId)
    {
        allocationId = keccak256(abi.encodePacked("alloc-", target, deployedAmount, riskScoreBps));
        SovereignTreasuryEngine.AllocationRequest memory request = SovereignTreasuryEngine.AllocationRequest({
            allocationId: allocationId,
            deployedAmountWei: deployedAmount,
            expectedApyBps: 700,
            riskScoreBps: riskScoreBps,
            destinationChainId: DEST_CHAIN_ID,
            target: target,
            governanceProposalId: "GOV-ALLOC-1",
            metadata: bytes("")
        });

        vm.prank(GOVERNOR);
        treasury.queueAllocation(request);
        vm.prank(GOVERNOR);
        treasury.executeAllocation(request);
    }
}
