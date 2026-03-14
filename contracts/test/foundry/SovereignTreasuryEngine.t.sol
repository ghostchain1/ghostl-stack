// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/treasury/SovereignTreasuryEngine.sol";
import "../../src/treasury/SovereignRewardDistributor.sol";

contract MockSolvencyVerifier {
    function verifyProof(bytes calldata proof, bytes32, bytes32, bytes32, uint256) external pure returns (bool) {
        return proof.length > 0;
    }
}

contract SovereignTreasuryEngineTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant AGGREGATOR = address(0xA22E);
    address private constant YIELD_ROUTER = address(0xBEEF);
    address private constant TARGET = address(0xC0FFEE);

    function testDepositAndGovernedAllocation() public {
        SovereignTreasuryEngine treasury =
            new SovereignTreasuryEngine(GOVERNOR, address(0), block.chainid, 901, AGGREGATOR);

        vm.prank(AGGREGATOR);
        treasury.depositRevenueFromL2(1_000_000);

        vm.prank(GOVERNOR);
        treasury.queueAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-1"),
                deployedAmountWei: 100_000,
                expectedApyBps: 650,
                riskScoreBps: 2200,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-001",
                metadata: bytes("")
            })
        );

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("allocation_timelock_active"));
        treasury.executeAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-1"),
                deployedAmountWei: 100_000,
                expectedApyBps: 650,
                riskScoreBps: 2200,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-001",
                metadata: bytes("")
            })
        );
        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(GOVERNOR);
        treasury.executeAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-1"),
                deployedAmountWei: 100_000,
                expectedApyBps: 650,
                riskScoreBps: 2200,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-001",
                metadata: bytes("")
            })
        );

        assertEq(treasury.deployedCapitalWei(), 100_000, "deployed capital mismatch");

        vm.prank(GOVERNOR);
        treasury.setYieldRouter(YIELD_ROUTER);

        vm.prank(YIELD_ROUTER);
        treasury.recordYieldReturn(keccak256("alloc-1"), 10_000, 500);

        assertEq(treasury.yieldReturnedWei(), 10_000, "yield returned mismatch");
    }

    function testRewardTimelockAndInvariant() public {
        SovereignRewardDistributor distributor = new SovereignRewardDistributor(GOVERNOR, address(0));

        bytes32 cycleId = keccak256("cycle-1");
        uint64 executeAfter = uint64(block.timestamp + 10);

        vm.prank(GOVERNOR);
        distributor.queueRewardCycle(cycleId, 1_000_000, 2000, 3000, 3000, 2000, executeAfter, "GOV-002");

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("timelock_active"));
        distributor.executeRewardCycle(cycleId);

        vm.warp(block.timestamp + 11);
        vm.prank(GOVERNOR);
        distributor.executeRewardCycle(cycleId);

        assertEq(distributor.totalDistributedWei(), 1_000_000, "distributed mismatch");
    }

    function testRewardDistributionPolicyGuardsAndQueueByPolicy() public {
        SovereignRewardDistributor distributor = new SovereignRewardDistributor(GOVERNOR, address(0));

        vm.prank(GOVERNOR);
        distributor.configureDistributionPolicy(2_000, 3_000, 3_000, 1_000, 100_000, 800_000, true);

        bytes32 lowYieldCycle = keccak256("cycle-low-yield");
        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("yield_below_policy_min"));
        distributor.queueRewardCycleByPolicy(lowYieldCycle, 90_000, uint64(block.timestamp + 5), "GOV-RWD-POLICY-1");

        bytes32 overCapCycle = keccak256("cycle-over-cap");
        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("distribution_over_cycle_cap"));
        distributor.queueRewardCycleByPolicy(overCapCycle, 1_000_000, uint64(block.timestamp + 5), "GOV-RWD-POLICY-2");

        bytes32 cycleId = keccak256("cycle-policy-ok");
        uint64 eta = uint64(block.timestamp + 5);
        vm.prank(GOVERNOR);
        distributor.queueRewardCycleByPolicy(cycleId, 800_000, eta, "GOV-RWD-POLICY-3");

        (
            uint256 netYield,
            uint256 reserveWei,
            uint256 validatorWei,
            uint256 ecosystemWei,
            uint256 l2l3Wei,
            uint64 executeAfter,
            bool executed,

        ) = distributor.cycles(cycleId);

        assertEq(netYield, 800_000, "net yield mismatch");
        assertEq(reserveWei, 160_000, "reserve mismatch");
        assertEq(validatorWei, 240_000, "validator mismatch");
        assertEq(ecosystemWei, 240_000, "ecosystem mismatch");
        assertEq(l2l3Wei, 80_000, "l2l3 mismatch");
        assertEq(uint256(executeAfter), uint256(eta), "eta mismatch");
        assertTrue(!executed, "cycle should not be executed");

        vm.warp(block.timestamp + 6);
        vm.prank(GOVERNOR);
        distributor.executeRewardCycle(cycleId);

        assertEq(distributor.totalDistributedWei(), 720_000, "distributed total mismatch");
        assertEq(distributor.totalValidatorRewardsWei(), 240_000, "validator total mismatch");
    }

    function testQueueRewardCycleFromTreasuryAccounting() public {
        SovereignTreasuryEngine treasury =
            new SovereignTreasuryEngine(GOVERNOR, address(0), block.chainid, 901, AGGREGATOR);
        SovereignRewardDistributor distributor = new SovereignRewardDistributor(GOVERNOR, address(0));

        vm.prank(AGGREGATOR);
        treasury.depositRevenueFromL2(1_000_000);
        vm.prank(GOVERNOR);
        treasury.setMinAllocationDelaySeconds(0);

        vm.prank(GOVERNOR);
        treasury.queueAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-yield-source"),
                deployedAmountWei: 100_000,
                expectedApyBps: 650,
                riskScoreBps: 2_000,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-YIELD-ALLOC-1",
                metadata: bytes("")
            })
        );
        vm.prank(GOVERNOR);
        treasury.executeAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-yield-source"),
                deployedAmountWei: 100_000,
                expectedApyBps: 650,
                riskScoreBps: 2_000,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-YIELD-ALLOC-1",
                metadata: bytes("")
            })
        );
        vm.prank(GOVERNOR);
        treasury.recordYieldReturn(keccak256("alloc-yield-source"), 200_000, 500);

        vm.prank(GOVERNOR);
        distributor.configureDistributionPolicy(2_000, 3_000, 3_000, 1_000, 100_000, 500_000, true);
        vm.prank(GOVERNOR);
        distributor.setTreasuryYieldSource(address(treasury));
        vm.prank(GOVERNOR);
        distributor.setRequireSourceSnapshot(true);

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("source_epoch_missing"));
        distributor.queueRewardCycleFromTreasury(
            keccak256("cycle-source-missing"), uint64(block.timestamp + 5), "GOV-YIELD-CYCLE-1"
        );

        vm.prank(GOVERNOR);
        treasury.submitSolvencyProof(1, keccak256("assets"), keccak256("liabilities"), keccak256("net"), hex"01", "GOV-SNAP-2");
        vm.prank(GOVERNOR);
        treasury.recordTreasurySnapshot(1, keccak256("meta-source"), "GOV-SNAP-2");

        bytes32 cycleId = keccak256("cycle-source-ok");
        uint64 eta = uint64(block.timestamp + 5);
        vm.prank(GOVERNOR);
        distributor.queueRewardCycleFromTreasury(cycleId, eta, "GOV-YIELD-CYCLE-2");

        (
            uint256 netYield,
            uint256 reserveWei,
            uint256 validatorWei,
            uint256 ecosystemWei,
            uint256 l2l3Wei,
            uint64 executeAfter,
            bool executed,

        ) = distributor.cycles(cycleId);

        assertEq(netYield, 200_000, "cycle net yield mismatch");
        assertEq(reserveWei, 40_000, "cycle reserve mismatch");
        assertEq(validatorWei, 60_000, "cycle validator mismatch");
        assertEq(ecosystemWei, 60_000, "cycle ecosystem mismatch");
        assertEq(l2l3Wei, 20_000, "cycle l2l3 mismatch");
        assertEq(uint256(executeAfter), uint256(eta), "cycle eta mismatch");
        assertTrue(!executed, "cycle should be pending");
        assertEq(distributor.accountedYieldWei(), 200_000, "accounted yield mismatch");

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("no_new_net_yield"));
        distributor.queueRewardCycleFromTreasury(
            keccak256("cycle-source-repeat"), uint64(block.timestamp + 6), "GOV-YIELD-CYCLE-3"
        );
    }

    function testSolvencyProofFreshnessGate() public {
        SovereignTreasuryEngine treasury =
            new SovereignTreasuryEngine(GOVERNOR, address(0), block.chainid, 901, AGGREGATOR);
        MockSolvencyVerifier verifier = new MockSolvencyVerifier();

        vm.prank(GOVERNOR);
        treasury.setSolvencyVerifier(address(verifier));
        vm.prank(GOVERNOR);
        treasury.setSolvencyMaxAgeSeconds(1);
        vm.prank(GOVERNOR);
        treasury.setMinAllocationDelaySeconds(0);

        vm.prank(AGGREGATOR);
        treasury.depositRevenueFromL2(2_000_000);

        vm.prank(GOVERNOR);
        treasury.queueAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-missing-proof"),
                deployedAmountWei: 100_000,
                expectedApyBps: 650,
                riskScoreBps: 2200,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-SOLVENCY-1",
                metadata: bytes("")
            })
        );

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("solvency_proof_missing"));
        treasury.executeAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-missing-proof"),
                deployedAmountWei: 100_000,
                expectedApyBps: 650,
                riskScoreBps: 2200,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-SOLVENCY-1",
                metadata: bytes("")
            })
        );

        vm.prank(GOVERNOR);
        treasury.submitSolvencyProof(1, keccak256("assets"), keccak256("liabilities"), keccak256("net"), hex"01", "GOV-SOLVENCY-1");

        vm.prank(GOVERNOR);
        treasury.queueAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-after-proof"),
                deployedAmountWei: 100_000,
                expectedApyBps: 650,
                riskScoreBps: 2200,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-SOLVENCY-1",
                metadata: bytes("")
            })
        );

        vm.prank(GOVERNOR);
        treasury.executeAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-after-proof"),
                deployedAmountWei: 100_000,
                expectedApyBps: 650,
                riskScoreBps: 2200,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-SOLVENCY-1",
                metadata: bytes("")
            })
        );

        vm.prank(GOVERNOR);
        treasury.queueAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-stale"),
                deployedAmountWei: 50_000,
                expectedApyBps: 650,
                riskScoreBps: 2200,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-SOLVENCY-2",
                metadata: bytes("")
            })
        );
        vm.warp(block.timestamp + 2);
        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("solvency_proof_stale"));
        treasury.executeAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-stale"),
                deployedAmountWei: 50_000,
                expectedApyBps: 650,
                riskScoreBps: 2200,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-SOLVENCY-2",
                metadata: bytes("")
            })
        );
    }

    function testQueuedAllocationCanBeCancelled() public {
        SovereignTreasuryEngine treasury =
            new SovereignTreasuryEngine(GOVERNOR, address(0), block.chainid, 901, AGGREGATOR);

        vm.prank(AGGREGATOR);
        treasury.depositRevenueFromL2(1_000_000);

        bytes32 allocId = keccak256("alloc-cancel");
        SovereignTreasuryEngine.AllocationRequest memory req = SovereignTreasuryEngine.AllocationRequest({
            allocationId: allocId,
            deployedAmountWei: 100_000,
            expectedApyBps: 700,
            riskScoreBps: 2100,
            destinationChainId: block.chainid,
            target: TARGET,
            governanceProposalId: "GOV-CANCEL-1",
            metadata: bytes("meta")
        });

        vm.prank(GOVERNOR);
        treasury.queueAllocation(req);

        vm.prank(GOVERNOR);
        treasury.cancelQueuedAllocation(allocId);

        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("allocation_not_queued"));
        treasury.executeAllocation(req);
    }

    function testTreasurySnapshotRequiresGovernanceAndSolvencyEpoch() public {
        SovereignTreasuryEngine treasury =
            new SovereignTreasuryEngine(GOVERNOR, address(0), block.chainid, 901, AGGREGATOR);
        MockSolvencyVerifier verifier = new MockSolvencyVerifier();

        vm.prank(AGGREGATOR);
        treasury.depositRevenueFromL2(1_500_000);

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("solvency_proof_missing"));
        treasury.recordTreasurySnapshot(1, keccak256("meta"), "GOV-SNAP-1");

        vm.prank(GOVERNOR);
        treasury.setSolvencyVerifier(address(verifier));
        vm.prank(GOVERNOR);
        treasury.submitSolvencyProof(1, keccak256("assets"), keccak256("liabilities"), keccak256("net"), hex"01", "GOV-SNAP-1");

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("snapshot_epoch_mismatch"));
        treasury.recordTreasurySnapshot(2, keccak256("meta"), "GOV-SNAP-1");

        vm.prank(GOVERNOR);
        treasury.recordTreasurySnapshot(1, keccak256("meta"), "GOV-SNAP-1");
        assertEq(treasury.latestSnapshotEpoch(), 1, "snapshot epoch mismatch");

        (
            uint256 recordedAt,
            uint256 revenueBalance,
            uint256 deployedCapital,
            uint256 yieldReturned,
            uint16 riskExposure,
            bytes32 assetsRoot,
            bytes32 liabilitiesRoot,
            bytes32 netRoot,
            bytes32 commitment,
            uint32 circuitVersion,
            bytes32 metadataHash
        ) = treasury.treasurySnapshots(1);

        assertTrue(recordedAt > 0, "snapshot timestamp missing");
        assertEq(revenueBalance, 1_500_000, "snapshot revenue mismatch");
        assertEq(deployedCapital, 0, "snapshot deployed mismatch");
        assertEq(yieldReturned, 0, "snapshot yield mismatch");
        assertEq(uint256(riskExposure), 0, "snapshot risk mismatch");
        assertEq(assetsRoot, keccak256("assets"), "snapshot assets root mismatch");
        assertEq(liabilitiesRoot, keccak256("liabilities"), "snapshot liabilities root mismatch");
        assertEq(netRoot, keccak256("net"), "snapshot net root mismatch");
        assertEq(commitment, treasury.solvencyCommitmentByEpoch(1), "snapshot commitment mismatch");
        assertEq(uint256(circuitVersion), 0, "snapshot circuit mismatch");
        assertEq(metadataHash, keccak256("meta"), "snapshot metadata mismatch");

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("snapshot_exists"));
        treasury.recordTreasurySnapshot(1, keccak256("meta"), "GOV-SNAP-1");

        bytes32 snapHash = treasury.snapshotHash(1);
        assertTrue(snapHash != bytes32(0), "snapshot hash missing");
    }

    function testRiskPolicyCapsEnforced() public {
        SovereignTreasuryEngine treasury =
            new SovereignTreasuryEngine(GOVERNOR, address(0), block.chainid, 901, AGGREGATOR);

        vm.prank(AGGREGATOR);
        treasury.depositRevenueFromL2(1_000_000);

        vm.prank(GOVERNOR);
        treasury.setMinAllocationDelaySeconds(0);
        vm.prank(GOVERNOR);
        treasury.configureRiskPolicy(100_000, 2_000, 3_000, 2_500);

        // Single-allocation cap: 20% of 1_000_000 => 200_000.
        vm.prank(GOVERNOR);
        treasury.queueAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-single-cap"),
                deployedAmountWei: 300_000,
                expectedApyBps: 650,
                riskScoreBps: 2_000,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-RISK-1",
                metadata: bytes("")
            })
        );
        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("allocation_exceeds_single_cap"));
        treasury.executeAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-single-cap"),
                deployedAmountWei: 300_000,
                expectedApyBps: 650,
                riskScoreBps: 2_000,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-RISK-1",
                metadata: bytes("")
            })
        );

        // Risk exposure cap: 2_500 bps.
        vm.prank(GOVERNOR);
        treasury.queueAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-risk-cap"),
                deployedAmountWei: 200_000,
                expectedApyBps: 650,
                riskScoreBps: 3_000,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-RISK-2",
                metadata: bytes("")
            })
        );
        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("risk_exposure_cap"));
        treasury.executeAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-risk-cap"),
                deployedAmountWei: 200_000,
                expectedApyBps: 650,
                riskScoreBps: 3_000,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-RISK-2",
                metadata: bytes("")
            })
        );

        // Valid allocation under configured caps.
        vm.prank(GOVERNOR);
        treasury.queueAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-ok"),
                deployedAmountWei: 200_000,
                expectedApyBps: 650,
                riskScoreBps: 2_000,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-RISK-3",
                metadata: bytes("")
            })
        );
        vm.prank(GOVERNOR);
        treasury.executeAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-ok"),
                deployedAmountWei: 200_000,
                expectedApyBps: 650,
                riskScoreBps: 2_000,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-RISK-3",
                metadata: bytes("")
            })
        );
        assertEq(treasury.deployedCapitalWei(), 200_000, "deployed mismatch");

        // Total deployed cap: 30% of 1_000_000 => 300_000.
        vm.prank(GOVERNOR);
        treasury.queueAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-total-cap"),
                deployedAmountWei: 150_000,
                expectedApyBps: 650,
                riskScoreBps: 2_000,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-RISK-4",
                metadata: bytes("")
            })
        );
        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("allocation_exceeds_total_cap"));
        treasury.executeAllocation(
            SovereignTreasuryEngine.AllocationRequest({
                allocationId: keccak256("alloc-total-cap"),
                deployedAmountWei: 150_000,
                expectedApyBps: 650,
                riskScoreBps: 2_000,
                destinationChainId: block.chainid,
                target: TARGET,
                governanceProposalId: "GOV-RISK-4",
                metadata: bytes("")
            })
        );
    }

    function testSolvencyVerifierRegistryRejectsInvalidAndReplayedProofs() public {
        SovereignTreasuryEngine treasury =
            new SovereignTreasuryEngine(GOVERNOR, address(0), block.chainid, 901, AGGREGATOR);
        MockSolvencyVerifier verifier = new MockSolvencyVerifier();

        vm.prank(GOVERNOR);
        treasury.setSolvencyVerifierForCircuit(1, address(verifier), true);
        vm.prank(GOVERNOR);
        treasury.setDefaultSolvencyCircuitVersion(1);

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("invalid_solvency_proof"));
        treasury.submitSolvencyProof(1, keccak256("assets-a"), keccak256("liabilities-a"), keccak256("net-a"), bytes(""), "GOV-ZK-1");

        vm.prank(GOVERNOR);
        treasury.submitSolvencyProof(1, keccak256("assets-a"), keccak256("liabilities-a"), keccak256("net-a"), hex"010203", "GOV-ZK-1");
        assertEq(uint256(treasury.latestSolvencyCircuitVersion()), 1, "latest circuit mismatch");
        assertTrue(treasury.solvencyCommitmentByEpoch(1) != bytes32(0), "missing epoch commitment");

        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("proof_replayed"));
        treasury.submitSolvencyProofWithCircuit(
            2, keccak256("assets-b"), keccak256("liabilities-b"), keccak256("net-b"), hex"010203", "GOV-ZK-2", 1
        );
    }

    function testAllocationCanRequireSnapshotEpochSync() public {
        SovereignTreasuryEngine treasury =
            new SovereignTreasuryEngine(GOVERNOR, address(0), block.chainid, 901, AGGREGATOR);
        MockSolvencyVerifier verifier = new MockSolvencyVerifier();

        vm.prank(AGGREGATOR);
        treasury.depositRevenueFromL2(2_000_000);

        vm.prank(GOVERNOR);
        treasury.setSolvencyVerifierForCircuit(1, address(verifier), true);
        vm.prank(GOVERNOR);
        treasury.setDefaultSolvencyCircuitVersion(1);
        vm.prank(GOVERNOR);
        treasury.setMinAllocationDelaySeconds(0);
        vm.prank(GOVERNOR);
        treasury.setRequireSnapshotSyncForAllocation(true);
        vm.prank(GOVERNOR);
        treasury.submitSolvencyProof(1, keccak256("assets"), keccak256("liabilities"), keccak256("net"), hex"01", "GOV-SYNC-1");

        SovereignTreasuryEngine.AllocationRequest memory req = SovereignTreasuryEngine.AllocationRequest({
            allocationId: keccak256("alloc-sync"),
            deployedAmountWei: 100_000,
            expectedApyBps: 650,
            riskScoreBps: 2_000,
            destinationChainId: block.chainid,
            target: TARGET,
            governanceProposalId: "GOV-SYNC-1",
            metadata: bytes("")
        });

        vm.prank(GOVERNOR);
        treasury.queueAllocation(req);
        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("snapshot_required"));
        treasury.executeAllocation(req);

        vm.prank(GOVERNOR);
        treasury.recordTreasurySnapshot(1, keccak256("sync-meta"), "GOV-SYNC-1");
        vm.prank(GOVERNOR);
        treasury.executeAllocation(req);
    }
}
