// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/treasury/SovereignTreasuryEngine.sol";
import "../../src/treasury/SovereignTreasuryAllocator.sol";

contract SovereignTreasuryAllocatorTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant AGGREGATOR = address(0xA66);

    address private constant INFRA = address(0x1001);
    address private constant REWARDS = address(0x1002);
    address private constant BURN = address(0x1003);
    address private constant FOUNDER = address(0x1004);
    address private constant GROWTH = address(0x1005);
    address private constant EMERGENCY = address(0x1006);

    function testQueueAndExecuteBalancedTreasuryEpochFromSource() public {
        SovereignTreasuryEngine treasury;
        SovereignTreasuryAllocator allocator;
        (treasury, allocator) = _deployAllocatorStack();

        vm.prank(AGGREGATOR);
        treasury.depositRevenueFromL2(1_000_000);

        bytes32 epochId = keccak256("epoch-balanced");
        uint64 eta = uint64(block.timestamp + 10);
        vm.prank(GOVERNOR);
        allocator.queueTreasuryEpochFromSource(epochId, eta, "GOV-ALLOC-EPOCH-1");

        (
            uint256 netRevenueWei,
            uint256 infrastructureWei,
            uint256 rewardsWei,
            uint256 burnWei,
            uint256 founderWei,
            uint256 growthWei,
            uint256 emergencyWei,
            uint64 executeAfter,
            bool executed,
            uint256 sourceEpoch,

        ) = allocator.epochs(epochId);

        assertEq(netRevenueWei, 1_000_000, "net revenue mismatch");
        assertEq(infrastructureWei, 200_000, "infra mismatch");
        assertEq(rewardsWei, 250_000, "rewards mismatch");
        assertEq(burnWei, 150_000, "burn mismatch");
        assertEq(founderWei, 100_000, "founder mismatch");
        assertEq(growthWei, 200_000, "growth mismatch");
        assertEq(emergencyWei, 100_000, "emergency mismatch");
        assertEq(uint256(executeAfter), uint256(eta), "eta mismatch");
        assertTrue(!executed, "epoch should be pending");
        assertEq(sourceEpoch, 0, "unexpected source epoch");

        vm.warp(block.timestamp + 11);
        vm.prank(GOVERNOR);
        allocator.executeTreasuryEpoch(epochId);

        assertEq(allocator.totalDistributedWei(), 1_000_000, "distributed mismatch");
        assertEq(allocator.totalInfrastructureWei(), 200_000, "infra total mismatch");
        assertEq(allocator.totalRewardsWei(), 250_000, "rewards total mismatch");
        assertEq(allocator.totalBurnWei(), 150_000, "burn total mismatch");
        assertEq(allocator.totalFounderWei(), 100_000, "founder total mismatch");
        assertEq(allocator.totalGrowthWei(), 200_000, "growth total mismatch");
        assertEq(allocator.totalEmergencyWei(), 100_000, "emergency total mismatch");
        assertEq(allocator.accountedRevenueWei(), 1_000_000, "accounted revenue mismatch");
    }

    function testFounderProfitOnlyDefersFounderToGrowth() public {
        SovereignTreasuryEngine treasury;
        SovereignTreasuryAllocator allocator;
        (treasury, allocator) = _deployAllocatorStack();

        vm.prank(GOVERNOR);
        allocator.configureAllocationPolicy(2000, 2500, 1500, 1000, 2000, 1000, 50_000, 0, true, 500_000, true);

        vm.prank(AGGREGATOR);
        treasury.depositRevenueFromL2(400_000);

        bytes32 epochId = keccak256("epoch-profit-only");
        vm.prank(GOVERNOR);
        allocator.queueTreasuryEpochFromSource(epochId, uint64(block.timestamp + 5), "GOV-ALLOC-EPOCH-2");

        (
            uint256 netRevenueWei,
            uint256 infrastructureWei,
            uint256 rewardsWei,
            uint256 burnWei,
            uint256 founderWei,
            uint256 growthWei,
            uint256 emergencyWei,
            uint64 executeAfter,
            bool executed,
            uint256 sourceEpoch,

        ) = allocator.epochs(epochId);
        executeAfter;
        executed;
        sourceEpoch;

        assertEq(netRevenueWei, 400_000, "net revenue mismatch");
        assertEq(infrastructureWei, 80_000, "infra mismatch");
        assertEq(rewardsWei, 100_000, "rewards mismatch");
        assertEq(burnWei, 60_000, "burn mismatch");
        assertEq(founderWei, 0, "founder should be deferred");
        assertEq(growthWei, 120_000, "growth should absorb founder");
        assertEq(emergencyWei, 40_000, "emergency mismatch");
    }

    function testSourceSnapshotRequirementAndNoNewRevenueGuard() public {
        SovereignTreasuryEngine treasury;
        SovereignTreasuryAllocator allocator;
        (treasury, allocator) = _deployAllocatorStack();

        vm.prank(GOVERNOR);
        allocator.setRequireSourceSnapshot(true);

        vm.prank(AGGREGATOR);
        treasury.depositRevenueFromL2(200_000);

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("source_epoch_missing"));
        allocator.queueTreasuryEpochFromSource(
            keccak256("epoch-snapshot-required"), uint64(block.timestamp + 5), "GOV-ALLOC-EPOCH-3"
        );

        vm.prank(GOVERNOR);
        treasury.submitSolvencyProof(1, keccak256("assets"), keccak256("liabilities"), keccak256("net"), hex"01", "GOV-SNAP-3");
        vm.prank(GOVERNOR);
        treasury.recordTreasurySnapshot(1, keccak256("meta"), "GOV-SNAP-3");

        vm.prank(GOVERNOR);
        allocator.queueTreasuryEpochFromSource(
            keccak256("epoch-snapshot-ok"), uint64(block.timestamp + 5), "GOV-ALLOC-EPOCH-4"
        );

        assertEq(allocator.lastQueuedSourceEpoch(), 1, "source epoch tracking mismatch");
        assertEq(allocator.accountedRevenueWei(), 200_000, "accounted revenue mismatch");

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("no_new_net_revenue"));
        allocator.queueTreasuryEpochFromSource(
            keccak256("epoch-no-new-revenue"), uint64(block.timestamp + 6), "GOV-ALLOC-EPOCH-5"
        );
    }

    function _deployAllocatorStack() internal returns (SovereignTreasuryEngine treasury, SovereignTreasuryAllocator allocator) {
        treasury = new SovereignTreasuryEngine(GOVERNOR, address(0), block.chainid, 901, AGGREGATOR);
        allocator = new SovereignTreasuryAllocator(GOVERNOR, address(0));

        vm.prank(GOVERNOR);
        allocator.setTreasuryRevenueSource(address(treasury));
        vm.prank(GOVERNOR);
        allocator.setReceivers(INFRA, REWARDS, BURN, FOUNDER, GROWTH, EMERGENCY);
        vm.prank(GOVERNOR);
        allocator.configureAllocationPolicy(2000, 2500, 1500, 1000, 2000, 1000, 50_000, 0, false, 0, true);
    }
}
