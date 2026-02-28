// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../common/ReentrancyGuard.sol";

interface ISovereignTreasuryRevenueSource {
    function revenueBalanceWei() external view returns (uint256);
    function yieldReturnedWei() external view returns (uint256);
    function latestSolvencyEpoch() external view returns (uint256);
    function treasurySnapshotExists(uint256 epoch) external view returns (bool);
}

/// @notice Governance-locked treasury fee allocator for bills/rewards/burn/founder/growth/emergency buckets.
/// @dev This contract tracks policy-scheduled accounting splits; execution hooks for value transfer stay external.
contract SovereignTreasuryAllocator is Governed, ReentrancyGuard {
    uint16 public constant BPS_DENOM = 10_000;

    enum RevenueBasis {
        RevenueBalance,
        YieldReturned
    }

    struct AllocationPolicy {
        uint16 infrastructureBps;
        uint16 rewardsBps;
        uint16 burnBps;
        uint16 founderBps;
        uint16 growthBps;
        uint16 emergencyBps;
        uint256 minNetRevenueWei;
        uint256 maxEpochDistributionWei;
        bool founderProfitOnly;
        uint256 founderProfitThresholdWei;
        bool enabled;
    }

    struct TreasuryEpoch {
        uint256 netRevenueWei;
        uint256 infrastructureWei;
        uint256 rewardsWei;
        uint256 burnWei;
        uint256 founderWei;
        uint256 growthWei;
        uint256 emergencyWei;
        uint64 executeAfter;
        bool executed;
        uint256 sourceEpoch;
        string governanceProposalId;
    }

    mapping(bytes32 => TreasuryEpoch) public epochs;

    AllocationPolicy public policy;
    address public treasuryRevenueSource;
    RevenueBasis public revenueBasis;
    uint256 public accountedRevenueWei;
    uint256 public lastQueuedSourceEpoch;
    bool public requireSourceSnapshot;

    address public infrastructureReceiver;
    address public rewardsReceiver;
    address public burnReceiver;
    address public founderReceiver;
    address public growthReceiver;
    address public emergencyReceiver;

    uint256 public totalDistributedWei;
    uint256 public totalInfrastructureWei;
    uint256 public totalRewardsWei;
    uint256 public totalBurnWei;
    uint256 public totalFounderWei;
    uint256 public totalGrowthWei;
    uint256 public totalEmergencyWei;

    bool public emergencyHalt;
    bool public allocationPaused;

    event TreasuryRevenueSourceUpdated(address indexed previousSource, address indexed nextSource);
    event RevenueBasisUpdated(RevenueBasis previousBasis, RevenueBasis nextBasis);
    event SourceSnapshotRequirementUpdated(bool required);
    event TreasuryAllocatorFlagsUpdated(bool emergencyHalt, bool allocationPaused);
    event TreasuryReceiversUpdated(
        address indexed infrastructureReceiver,
        address indexed rewardsReceiver,
        address indexed burnReceiver,
        address founderReceiver,
        address growthReceiver,
        address emergencyReceiver
    );
    event AllocationPolicyUpdated(
        uint16 infrastructureBps,
        uint16 rewardsBps,
        uint16 burnBps,
        uint16 founderBps,
        uint16 growthBps,
        uint16 emergencyBps,
        uint256 minNetRevenueWei,
        uint256 maxEpochDistributionWei,
        bool founderProfitOnly,
        uint256 founderProfitThresholdWei,
        bool enabled
    );
    event TreasuryEpochQueued(
        bytes32 indexed epochId,
        string governanceProposalId,
        uint256 netRevenueWei,
        uint256 infrastructureWei,
        uint256 rewardsWei,
        uint256 burnWei,
        uint256 founderWei,
        uint256 growthWei,
        uint256 emergencyWei,
        uint64 executeAfter,
        uint256 sourceEpoch
    );
    event TreasuryEpochQueuedFromSource(
        bytes32 indexed epochId,
        string governanceProposalId,
        uint256 netRevenueWei,
        uint256 totalRevenueWei,
        uint256 sourceEpoch,
        RevenueBasis basis
    );
    event TreasuryEpochExecuted(
        bytes32 indexed epochId,
        uint256 totalDistributedWei,
        uint256 infrastructureWei,
        uint256 rewardsWei,
        uint256 burnWei,
        uint256 founderWei,
        uint256 growthWei,
        uint256 emergencyWei
    );

    modifier whenAllocatorEnabled() {
        require(!emergencyHalt, "emergency_halt");
        require(!allocationPaused, "allocation_paused");
        _;
    }

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {
        revenueBasis = RevenueBasis.RevenueBalance;
    }

    function setTreasuryRevenueSource(address source) external onlyGovernance {
        address previous = treasuryRevenueSource;
        treasuryRevenueSource = source;
        emit TreasuryRevenueSourceUpdated(previous, source);
    }

    function setRevenueBasis(RevenueBasis nextBasis) external onlyGovernance {
        RevenueBasis previous = revenueBasis;
        revenueBasis = nextBasis;
        emit RevenueBasisUpdated(previous, nextBasis);
    }

    function setRequireSourceSnapshot(bool required) external onlyGovernance {
        requireSourceSnapshot = required;
        emit SourceSnapshotRequirementUpdated(required);
    }

    function setFlags(bool emergencyHalt_, bool allocationPaused_) external onlyGovernance {
        emergencyHalt = emergencyHalt_;
        allocationPaused = allocationPaused_;
        emit TreasuryAllocatorFlagsUpdated(emergencyHalt_, allocationPaused_);
    }

    function setReceivers(
        address infrastructureReceiver_,
        address rewardsReceiver_,
        address burnReceiver_,
        address founderReceiver_,
        address growthReceiver_,
        address emergencyReceiver_
    ) external onlyGovernance {
        infrastructureReceiver = infrastructureReceiver_;
        rewardsReceiver = rewardsReceiver_;
        burnReceiver = burnReceiver_;
        founderReceiver = founderReceiver_;
        growthReceiver = growthReceiver_;
        emergencyReceiver = emergencyReceiver_;
        emit TreasuryReceiversUpdated(
            infrastructureReceiver_,
            rewardsReceiver_,
            burnReceiver_,
            founderReceiver_,
            growthReceiver_,
            emergencyReceiver_
        );
    }

    function configureAllocationPolicy(
        uint16 infrastructureBps,
        uint16 rewardsBps,
        uint16 burnBps,
        uint16 founderBps,
        uint16 growthBps,
        uint16 emergencyBps,
        uint256 minNetRevenueWei,
        uint256 maxEpochDistributionWei,
        bool founderProfitOnly,
        uint256 founderProfitThresholdWei,
        bool enabled
    ) external onlyGovernance {
        uint256 totalBps = uint256(infrastructureBps) + uint256(rewardsBps) + uint256(burnBps) + uint256(founderBps)
            + uint256(growthBps) + uint256(emergencyBps);
        require(totalBps <= BPS_DENOM, "bps>10000");
        if (enabled) {
            require(totalBps > 0, "policy_bps=0");
        }

        policy = AllocationPolicy({
            infrastructureBps: infrastructureBps,
            rewardsBps: rewardsBps,
            burnBps: burnBps,
            founderBps: founderBps,
            growthBps: growthBps,
            emergencyBps: emergencyBps,
            minNetRevenueWei: minNetRevenueWei,
            maxEpochDistributionWei: maxEpochDistributionWei,
            founderProfitOnly: founderProfitOnly,
            founderProfitThresholdWei: founderProfitThresholdWei,
            enabled: enabled
        });

        emit AllocationPolicyUpdated(
            infrastructureBps,
            rewardsBps,
            burnBps,
            founderBps,
            growthBps,
            emergencyBps,
            minNetRevenueWei,
            maxEpochDistributionWei,
            founderProfitOnly,
            founderProfitThresholdWei,
            enabled
        );
    }

    function previewSourceNetRevenue()
        public
        view
        returns (uint256 netRevenueWei, uint256 totalRevenueWei, uint256 accountedRevenueWei_)
    {
        address source = treasuryRevenueSource;
        require(source != address(0), "source=0");

        totalRevenueWei = _currentSourceRevenue(source, revenueBasis);
        accountedRevenueWei_ = accountedRevenueWei;
        if (totalRevenueWei <= accountedRevenueWei_) {
            return (0, totalRevenueWei, accountedRevenueWei_);
        }
        netRevenueWei = totalRevenueWei - accountedRevenueWei_;
    }

    function previewSplit(
        uint256 netRevenueWei,
        uint16 infrastructureBps,
        uint16 rewardsBps,
        uint16 burnBps,
        uint16 founderBps,
        uint16 growthBps,
        uint16 emergencyBps,
        bool founderProfitOnly,
        uint256 founderProfitThresholdWei
    )
        public
        pure
        returns (
            uint256 infrastructureWei,
            uint256 rewardsWei,
            uint256 burnWei,
            uint256 founderWei,
            uint256 growthWei,
            uint256 emergencyWei,
            uint256 totalDistributed
        )
    {
        uint256 totalBps = uint256(infrastructureBps) + uint256(rewardsBps) + uint256(burnBps) + uint256(founderBps)
            + uint256(growthBps) + uint256(emergencyBps);
        require(totalBps <= BPS_DENOM, "bps>10000");

        infrastructureWei = (netRevenueWei * infrastructureBps) / BPS_DENOM;
        rewardsWei = (netRevenueWei * rewardsBps) / BPS_DENOM;
        burnWei = (netRevenueWei * burnBps) / BPS_DENOM;
        founderWei = (netRevenueWei * founderBps) / BPS_DENOM;
        growthWei = (netRevenueWei * growthBps) / BPS_DENOM;
        emergencyWei = (netRevenueWei * emergencyBps) / BPS_DENOM;

        if (founderProfitOnly && netRevenueWei < founderProfitThresholdWei) {
            growthWei += founderWei;
            founderWei = 0;
        }

        totalDistributed = infrastructureWei + rewardsWei + burnWei + founderWei + growthWei + emergencyWei;
        require(totalDistributed <= netRevenueWei, "distribution>revenue");
    }

    function previewPolicySplit(uint256 netRevenueWei)
        public
        view
        returns (
            uint256 infrastructureWei,
            uint256 rewardsWei,
            uint256 burnWei,
            uint256 founderWei,
            uint256 growthWei,
            uint256 emergencyWei,
            uint256 totalDistributed
        )
    {
        AllocationPolicy memory p = policy;
        require(p.enabled, "policy_disabled");
        require(netRevenueWei >= p.minNetRevenueWei, "revenue_below_policy_min");

        (infrastructureWei, rewardsWei, burnWei, founderWei, growthWei, emergencyWei, totalDistributed) = previewSplit(
            netRevenueWei,
            p.infrastructureBps,
            p.rewardsBps,
            p.burnBps,
            p.founderBps,
            p.growthBps,
            p.emergencyBps,
            p.founderProfitOnly,
            p.founderProfitThresholdWei
        );

        if (p.maxEpochDistributionWei > 0) {
            require(totalDistributed <= p.maxEpochDistributionWei, "distribution_over_epoch_cap");
        }
    }

    function queueTreasuryEpochByPolicy(
        bytes32 epochId,
        uint256 netRevenueWei,
        uint64 executeAfter,
        string calldata governanceProposalId
    ) external onlyGovernance whenAllocatorEnabled {
        (
            uint256 infrastructureWei,
            uint256 rewardsWei,
            uint256 burnWei,
            uint256 founderWei,
            uint256 growthWei,
            uint256 emergencyWei,

        ) = previewPolicySplit(netRevenueWei);

        _validateReceivers(infrastructureWei, rewardsWei, burnWei, founderWei, growthWei, emergencyWei);
        _queueTreasuryEpoch(
            epochId,
            governanceProposalId,
            netRevenueWei,
            infrastructureWei,
            rewardsWei,
            burnWei,
            founderWei,
            growthWei,
            emergencyWei,
            executeAfter,
            0
        );
    }

    function queueTreasuryEpochFromSource(bytes32 epochId, uint64 executeAfter, string calldata governanceProposalId)
        external
        onlyGovernance
        whenAllocatorEnabled
    {
        address source = treasuryRevenueSource;
        require(source != address(0), "source=0");

        RevenueBasis basis = revenueBasis;
        uint256 totalRevenueWei = _currentSourceRevenue(source, basis);
        uint256 accounted = accountedRevenueWei;
        require(totalRevenueWei > accounted, "no_new_net_revenue");
        uint256 netRevenueWei = totalRevenueWei - accounted;

        uint256 sourceEpoch = ISovereignTreasuryRevenueSource(source).latestSolvencyEpoch();
        if (requireSourceSnapshot) {
            require(sourceEpoch != 0, "source_epoch_missing");
            require(ISovereignTreasuryRevenueSource(source).treasurySnapshotExists(sourceEpoch), "source_snapshot_missing");
        }

        (
            uint256 infrastructureWei,
            uint256 rewardsWei,
            uint256 burnWei,
            uint256 founderWei,
            uint256 growthWei,
            uint256 emergencyWei,

        ) = previewPolicySplit(netRevenueWei);

        _validateReceivers(infrastructureWei, rewardsWei, burnWei, founderWei, growthWei, emergencyWei);
        _queueTreasuryEpoch(
            epochId,
            governanceProposalId,
            netRevenueWei,
            infrastructureWei,
            rewardsWei,
            burnWei,
            founderWei,
            growthWei,
            emergencyWei,
            executeAfter,
            sourceEpoch
        );

        accountedRevenueWei = totalRevenueWei;
        if (sourceEpoch != 0) {
            lastQueuedSourceEpoch = sourceEpoch;
        }

        emit TreasuryEpochQueuedFromSource(epochId, governanceProposalId, netRevenueWei, totalRevenueWei, sourceEpoch, basis);
    }

    function executeTreasuryEpoch(bytes32 epochId) external onlyGovernance nonReentrant whenAllocatorEnabled {
        TreasuryEpoch storage epoch = epochs[epochId];
        require(epoch.executeAfter != 0, "epoch_not_found");
        require(!epoch.executed, "epoch_executed");
        require(block.timestamp >= epoch.executeAfter, "timelock_active");

        uint256 distributed =
            epoch.infrastructureWei + epoch.rewardsWei + epoch.burnWei + epoch.founderWei + epoch.growthWei + epoch.emergencyWei;
        require(distributed <= epoch.netRevenueWei, "distribution>revenue");

        epoch.executed = true;

        totalDistributedWei += distributed;
        totalInfrastructureWei += epoch.infrastructureWei;
        totalRewardsWei += epoch.rewardsWei;
        totalBurnWei += epoch.burnWei;
        totalFounderWei += epoch.founderWei;
        totalGrowthWei += epoch.growthWei;
        totalEmergencyWei += epoch.emergencyWei;

        emit TreasuryEpochExecuted(
            epochId,
            distributed,
            epoch.infrastructureWei,
            epoch.rewardsWei,
            epoch.burnWei,
            epoch.founderWei,
            epoch.growthWei,
            epoch.emergencyWei
        );
    }

    function _queueTreasuryEpoch(
        bytes32 epochId,
        string calldata governanceProposalId,
        uint256 netRevenueWei,
        uint256 infrastructureWei,
        uint256 rewardsWei,
        uint256 burnWei,
        uint256 founderWei,
        uint256 growthWei,
        uint256 emergencyWei,
        uint64 executeAfter,
        uint256 sourceEpoch
    ) internal {
        require(epochId != bytes32(0), "epoch_id=0");
        require(epochs[epochId].executeAfter == 0, "epoch_exists");
        require(netRevenueWei > 0, "revenue=0");
        require(bytes(governanceProposalId).length > 0, "governance_proposal_required");
        require(executeAfter >= block.timestamp, "execute_after<present");

        epochs[epochId] = TreasuryEpoch({
            netRevenueWei: netRevenueWei,
            infrastructureWei: infrastructureWei,
            rewardsWei: rewardsWei,
            burnWei: burnWei,
            founderWei: founderWei,
            growthWei: growthWei,
            emergencyWei: emergencyWei,
            executeAfter: executeAfter,
            executed: false,
            sourceEpoch: sourceEpoch,
            governanceProposalId: governanceProposalId
        });

        emit TreasuryEpochQueued(
            epochId,
            governanceProposalId,
            netRevenueWei,
            infrastructureWei,
            rewardsWei,
            burnWei,
            founderWei,
            growthWei,
            emergencyWei,
            executeAfter,
            sourceEpoch
        );
    }

    function _validateReceivers(
        uint256 infrastructureWei,
        uint256 rewardsWei,
        uint256 burnWei,
        uint256 founderWei,
        uint256 growthWei,
        uint256 emergencyWei
    ) internal view {
        if (infrastructureWei > 0) require(infrastructureReceiver != address(0), "infrastructure_receiver=0");
        if (rewardsWei > 0) require(rewardsReceiver != address(0), "rewards_receiver=0");
        if (burnWei > 0) require(burnReceiver != address(0), "burn_receiver=0");
        if (founderWei > 0) require(founderReceiver != address(0), "founder_receiver=0");
        if (growthWei > 0) require(growthReceiver != address(0), "growth_receiver=0");
        if (emergencyWei > 0) require(emergencyReceiver != address(0), "emergency_receiver=0");
    }

    function _currentSourceRevenue(address source, RevenueBasis basis) internal view returns (uint256) {
        if (basis == RevenueBasis.YieldReturned) {
            return ISovereignTreasuryRevenueSource(source).yieldReturnedWei();
        }
        return ISovereignTreasuryRevenueSource(source).revenueBalanceWei();
    }
}
