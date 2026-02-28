import { expect } from "chai";
import { ethers } from "hardhat";

describe("Sovereign revenue + treasury + redistribution", () => {
  it("enforces L2-only revenue intake and governance-locked allocation", async () => {
    const [governor, l2Aggregator, yieldRouter, outsider] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    const Treasury = await ethers.getContractFactory("SovereignTreasuryEngine");
    const treasury = await Treasury.connect(governor).deploy(
      governor.address,
      ethers.ZeroAddress,
      Number(network.chainId),
      901,
      l2Aggregator.address
    );
    await treasury.waitForDeployment();

    await expect(treasury.connect(outsider).depositRevenueFromL2(100n)).to.be.revertedWith("only_l2_aggregator");

    await expect(treasury.connect(l2Aggregator).depositRevenueFromL2(1_000_000n))
      .to.emit(treasury, "RevenueDepositedFromL2")
      .withArgs(l2Aggregator.address, 1_000_000n, 1_000_000n);

    const allocRequest = {
      allocationId: ethers.id("alloc-1"),
      deployedAmountWei: 100_000n,
      expectedApyBps: 650,
      riskScoreBps: 2400,
      destinationChainId: Number(network.chainId),
      target: yieldRouter.address,
      governanceProposalId: "",
      metadata: "0x"
    };

    await expect(treasury.connect(governor).queueAllocation(allocRequest)).to.be.revertedWith(
      "governance_proposal_required"
    );

    const queuedRequest = {
      ...allocRequest,
      governanceProposalId: "GOV-001"
    };

    await expect(treasury.connect(governor).queueAllocation(queuedRequest)).to.emit(treasury, "AllocationQueued");

    await expect(
      treasury.connect(governor).executeAllocation(queuedRequest)
    ).to.be.revertedWith("allocation_timelock_active");

    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);

    await expect(
      treasury.connect(governor).executeAllocation({
        allocationId: ethers.id("alloc-1"),
        deployedAmountWei: 100_000n,
        expectedApyBps: 650,
        riskScoreBps: 2500,
        destinationChainId: Number(network.chainId),
        target: yieldRouter.address,
        governanceProposalId: "GOV-001",
        metadata: "0x"
      })
    ).to.be.revertedWith("allocation_request_mismatch");

    await expect(treasury.connect(governor).executeAllocation(queuedRequest)).to.emit(treasury, "AllocationExecuted");

    expect(await treasury.deployedCapitalWei()).to.equal(100_000n);

    await expect(treasury.connect(outsider).recordYieldReturn(ethers.id("alloc-1"), 10_000n, 500)).to.be.revertedWith(
      "not_yield_router_or_governance"
    );

    await (await treasury.connect(governor).setYieldRouter(yieldRouter.address)).wait();
    await expect(treasury.connect(yieldRouter).recordYieldReturn(ethers.id("alloc-1"), 10_000n, 500)).to.emit(
      treasury,
      "YieldRecorded"
    );
  });

  it("enforces timelock and net-yield bounds in reward distributor", async () => {
    const [governor] = await ethers.getSigners();

    const Distributor = await ethers.getContractFactory("SovereignRewardDistributor");
    const distributor = await Distributor.connect(governor).deploy(governor.address, ethers.ZeroAddress);
    await distributor.waitForDeployment();

    const cycleId = ethers.id("cycle-1");
    const now = (await ethers.provider.getBlock("latest"))?.timestamp || 0;

    await expect(
      distributor.connect(governor).queueRewardCycle(
        cycleId,
        1_000_000n,
        5000,
        5000,
        100,
        0,
        now + 60,
        "GOV-002"
      )
    ).to.be.revertedWith("bps>10000");

    await expect(
      distributor.connect(governor).queueRewardCycle(
        cycleId,
        1_000_000n,
        2000,
        3000,
        3000,
        2000,
        now + 60,
        "GOV-002"
      )
    ).to.emit(distributor, "RewardCycleQueued");

    await expect(distributor.connect(governor).executeRewardCycle(cycleId)).to.be.revertedWith("timelock_active");

    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    await expect(distributor.connect(governor).executeRewardCycle(cycleId)).to.emit(distributor, "RewardCycleExecuted");
    expect(await distributor.totalDistributedWei()).to.equal(1_000_000n);
  });

  it("enforces distribution policy guards and queues cycles by policy", async () => {
    const [governor] = await ethers.getSigners();

    const Distributor = await ethers.getContractFactory("SovereignRewardDistributor");
    const distributor = await Distributor.connect(governor).deploy(governor.address, ethers.ZeroAddress);
    await distributor.waitForDeployment();

    await (await distributor.connect(governor).configureDistributionPolicy(2000, 3000, 3000, 1000, 100_000n, 800_000n, true)).wait();

    const now = (await ethers.provider.getBlock("latest"))?.timestamp || 0;

    await expect(
      distributor.connect(governor).queueRewardCycleByPolicy(ethers.id("cycle-low"), 90_000n, now + 5, "GOV-RWD-POLICY-1")
    ).to.be.revertedWith("yield_below_policy_min");

    await expect(
      distributor
        .connect(governor)
        .queueRewardCycleByPolicy(ethers.id("cycle-cap"), 1_000_000n, now + 5, "GOV-RWD-POLICY-2")
    ).to.be.revertedWith("distribution_over_cycle_cap");

    const cycleId = ethers.id("cycle-policy-ok");
    await expect(
      distributor.connect(governor).queueRewardCycleByPolicy(cycleId, 800_000n, now + 5, "GOV-RWD-POLICY-3")
    ).to.emit(distributor, "RewardCycleQueued");

    const cycle = await distributor.cycles(cycleId);
    expect(cycle.netYieldWei).to.equal(800_000n);
    expect(cycle.operationalReserveWei).to.equal(160_000n);
    expect(cycle.validatorRewardsWei).to.equal(240_000n);
    expect(cycle.ecosystemIncentivesWei).to.equal(240_000n);
    expect(cycle.l2l3IncentiveWei).to.equal(80_000n);

    await ethers.provider.send("evm_increaseTime", [6]);
    await ethers.provider.send("evm_mine", []);

    await expect(distributor.connect(governor).executeRewardCycle(cycleId)).to.emit(distributor, "RewardCycleExecuted");
    expect(await distributor.totalDistributedWei()).to.equal(720_000n);
    expect(await distributor.totalValidatorRewardsWei()).to.equal(240_000n);
  });

  it("halts allocation and distribution when emergency flag is enabled", async () => {
    const [governor, l2Aggregator, target] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    const Treasury = await ethers.getContractFactory("SovereignTreasuryEngine");
    const treasury = await Treasury.connect(governor).deploy(
      governor.address,
      ethers.ZeroAddress,
      Number(network.chainId),
      901,
      l2Aggregator.address
    );
    await treasury.waitForDeployment();

    await (await treasury.connect(l2Aggregator).depositRevenueFromL2(1_000_000n)).wait();
    await (await treasury.connect(governor).setSafetyFlags(true, false, false)).wait();

    await expect(
      treasury.connect(governor).queueAllocation({
        allocationId: ethers.id("alloc-halt"),
        deployedAmountWei: 100_000n,
        expectedApyBps: 700,
        riskScoreBps: 3000,
        destinationChainId: Number(network.chainId),
        target: target.address,
        governanceProposalId: "GOV-003",
        metadata: "0x"
      })
    ).to.be.revertedWith("emergency_halt");

    const Distributor = await ethers.getContractFactory("SovereignRewardDistributor");
    const distributor = await Distributor.connect(governor).deploy(governor.address, ethers.ZeroAddress);
    await distributor.waitForDeployment();

    await (await distributor.connect(governor).setFlags(true, false)).wait();

    const now = (await ethers.provider.getBlock("latest"))?.timestamp || 0;
    await expect(
      distributor.connect(governor).queueRewardCycle(
        ethers.id("cycle-halt"),
        100_000n,
        2000,
        3000,
        3000,
        2000,
        now + 10,
        "GOV-004"
      )
    ).to.be.revertedWith("emergency_halt");
  });

  it("allows governance to cancel queued allocations", async () => {
    const [governor, l2Aggregator, target] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    const Treasury = await ethers.getContractFactory("SovereignTreasuryEngine");
    const treasury = await Treasury.connect(governor).deploy(
      governor.address,
      ethers.ZeroAddress,
      Number(network.chainId),
      901,
      l2Aggregator.address
    );
    await treasury.waitForDeployment();

    await (await treasury.connect(l2Aggregator).depositRevenueFromL2(1_000_000n)).wait();

    const req = {
      allocationId: ethers.id("alloc-cancel"),
      deployedAmountWei: 100_000n,
      expectedApyBps: 900,
      riskScoreBps: 2000,
      destinationChainId: Number(network.chainId),
      target: target.address,
      governanceProposalId: "GOV-005",
      metadata: "0x1234"
    };

    await expect(treasury.connect(governor).queueAllocation(req)).to.emit(treasury, "AllocationQueued");
    await expect(treasury.connect(governor).cancelQueuedAllocation(req.allocationId)).to.emit(
      treasury,
      "AllocationQueueCancelled"
    );
    await expect(treasury.connect(governor).executeAllocation(req)).to.be.revertedWith("allocation_not_queued");
  });

  it("records governance snapshots anchored to the latest solvency proof", async () => {
    const [governor, l2Aggregator, outsider] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    const Verifier = await ethers.getContractFactory("SolvencyVerifier");
    const verifier = await Verifier.connect(governor).deploy(governor.address, ethers.ZeroAddress);
    await verifier.waitForDeployment();

    const Treasury = await ethers.getContractFactory("SovereignTreasuryEngine");
    const treasury = await Treasury.connect(governor).deploy(
      governor.address,
      ethers.ZeroAddress,
      Number(network.chainId),
      901,
      l2Aggregator.address
    );
    await treasury.waitForDeployment();

    await (await treasury.connect(l2Aggregator).depositRevenueFromL2(500_000n)).wait();
    await (await treasury.connect(governor).setSolvencyVerifier(await verifier.getAddress())).wait();

    await expect(
      treasury
        .connect(governor)
        .submitSolvencyProof(1n, ethers.id("assets"), ethers.id("liabilities"), ethers.id("net"), "0x", "GOV-SNAP-1")
    ).to.be.revertedWith("invalid_solvency_proof");

    await expect(
      treasury.connect(outsider).recordTreasurySnapshot(1n, ethers.id("meta"), "GOV-SNAP-1")
    ).to.be.revertedWith("NOT_EXECUTOR");

    await (await treasury.connect(governor).setSolvencyVerifier(ethers.ZeroAddress)).wait();
    await (
      await treasury
        .connect(governor)
        .submitSolvencyProof(1n, ethers.id("assets"), ethers.id("liabilities"), ethers.id("net"), "0x01", "GOV-SNAP-1")
    ).wait();

    await expect(
      treasury.connect(governor).recordTreasurySnapshot(2n, ethers.id("meta"), "GOV-SNAP-1")
    ).to.be.revertedWith("snapshot_epoch_mismatch");

    await expect(treasury.connect(governor).recordTreasurySnapshot(1n, ethers.id("meta"), "GOV-SNAP-1")).to.emit(
      treasury,
      "TreasurySnapshotRecorded"
    );

    expect(await treasury.latestSnapshotEpoch()).to.equal(1n);
    await expect(treasury.connect(governor).recordTreasurySnapshot(1n, ethers.id("meta"), "GOV-SNAP-1")).to.be.revertedWith(
      "snapshot_exists"
    );
    expect(await treasury.snapshotHash(1n)).to.not.equal(ethers.ZeroHash);
  });

  it("enforces governance-configured risk policy caps", async () => {
    const [governor, l2Aggregator, target] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    const Treasury = await ethers.getContractFactory("SovereignTreasuryEngine");
    const treasury = await Treasury.connect(governor).deploy(
      governor.address,
      ethers.ZeroAddress,
      Number(network.chainId),
      901,
      l2Aggregator.address
    );
    await treasury.waitForDeployment();

    await (await treasury.connect(l2Aggregator).depositRevenueFromL2(1_000_000n)).wait();
    await (await treasury.connect(governor).setMinAllocationDelaySeconds(0)).wait();
    await (await treasury.connect(governor).configureRiskPolicy(100_000n, 2000, 3000, 2500)).wait();

    const tooLarge = {
      allocationId: ethers.id("alloc-too-large"),
      deployedAmountWei: 300_000n,
      expectedApyBps: 650,
      riskScoreBps: 2000,
      destinationChainId: Number(network.chainId),
      target: target.address,
      governanceProposalId: "GOV-RISK-1",
      metadata: "0x"
    };
    await (await treasury.connect(governor).queueAllocation(tooLarge)).wait();
    await expect(treasury.connect(governor).executeAllocation(tooLarge)).to.be.revertedWith("allocation_exceeds_single_cap");

    const riskTooHigh = {
      ...tooLarge,
      allocationId: ethers.id("alloc-risk-too-high"),
      deployedAmountWei: 200_000n,
      riskScoreBps: 3000,
      governanceProposalId: "GOV-RISK-2"
    };
    await (await treasury.connect(governor).queueAllocation(riskTooHigh)).wait();
    await expect(treasury.connect(governor).executeAllocation(riskTooHigh)).to.be.revertedWith("risk_exposure_cap");

    const good = {
      ...riskTooHigh,
      allocationId: ethers.id("alloc-good"),
      riskScoreBps: 2000,
      governanceProposalId: "GOV-RISK-3"
    };
    await (await treasury.connect(governor).queueAllocation(good)).wait();
    await (await treasury.connect(governor).executeAllocation(good)).wait();
    expect(await treasury.deployedCapitalWei()).to.equal(200_000n);

    const totalCap = {
      ...good,
      allocationId: ethers.id("alloc-total-cap"),
      deployedAmountWei: 150_000n,
      governanceProposalId: "GOV-RISK-4"
    };
    await (await treasury.connect(governor).queueAllocation(totalCap)).wait();
    await expect(treasury.connect(governor).executeAllocation(totalCap)).to.be.revertedWith("allocation_exceeds_total_cap");
  });

  it("enforces versioned solvency proofs with replay protection and snapshot sync gating", async () => {
    const [governor, l2Aggregator, target] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    const Treasury = await ethers.getContractFactory("SovereignTreasuryEngine");
    const treasury = await Treasury.connect(governor).deploy(
      governor.address,
      ethers.ZeroAddress,
      Number(network.chainId),
      901,
      l2Aggregator.address
    );
    await treasury.waitForDeployment();

    await (await treasury.connect(l2Aggregator).depositRevenueFromL2(1_000_000n)).wait();
    await (await treasury.connect(governor).setMinAllocationDelaySeconds(0)).wait();

    const Verifier = await ethers.getContractFactory("SolvencyVerifier");
    const verifier = await Verifier.connect(governor).deploy(governor.address, ethers.ZeroAddress);
    await verifier.waitForDeployment();

    await (await treasury.connect(governor).setSolvencyVerifierForCircuit(1, await verifier.getAddress(), true)).wait();
    await (await treasury.connect(governor).setDefaultSolvencyCircuitVersion(1)).wait();

    await expect(
      treasury
        .connect(governor)
        .submitSolvencyProof(1n, ethers.id("assets"), ethers.id("liabilities"), ethers.id("net"), "0x", "GOV-ZK-1")
    ).to.be.revertedWith("invalid_solvency_proof");

    await (
      await treasury
        .connect(governor)
        .submitSolvencyProof(1n, ethers.id("assets"), ethers.id("liabilities"), ethers.id("net"), "0x0102", "GOV-ZK-1")
    ).wait();
    expect(await treasury.latestSolvencyCircuitVersion()).to.equal(1n);

    await expect(
      treasury
        .connect(governor)
        .submitSolvencyProofWithCircuit(
          2n,
          ethers.id("assets-2"),
          ethers.id("liabilities-2"),
          ethers.id("net-2"),
          "0x0102",
          "GOV-ZK-2",
          1
        )
    ).to.be.revertedWith("proof_replayed");

    await (await treasury.connect(governor).setRequireSnapshotSyncForAllocation(true)).wait();

    const req = {
      allocationId: ethers.id("alloc-sync"),
      deployedAmountWei: 100_000n,
      expectedApyBps: 650,
      riskScoreBps: 2000,
      destinationChainId: Number(network.chainId),
      target: target.address,
      governanceProposalId: "GOV-SYNC-1",
      metadata: "0x"
    };
    await (await treasury.connect(governor).queueAllocation(req)).wait();
    await expect(treasury.connect(governor).executeAllocation(req)).to.be.revertedWith("snapshot_required");

    await (await treasury.connect(governor).recordTreasurySnapshot(1n, ethers.id("sync-meta"), "GOV-SYNC-1")).wait();
    await (await treasury.connect(governor).executeAllocation(req)).wait();
  });
});
