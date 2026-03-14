// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "../common/ReentrancyGuard.sol";

interface ISovereignYieldSource {
    function yieldReturnedWei() external view returns (uint256);
    function latestSolvencyEpoch() external view returns (uint256);
    function treasurySnapshotExists(uint256 epoch) external view returns (bool);
}

/// @notice Timelocked reward distribution accounting contract.
/// @dev Distribution execution is governance-only and bounded by net yield.
contract SovereignRewardDistributor is Governed, ReentrancyGuard {
    struct DistributionPolicy {
        uint16 operationalReserveBps;
        uint16 validatorBps;
        uint16 ecosystemBps;
        uint16 l2l3Bps;
        uint256 minNetYieldWei;
        uint256 maxCycleDistributionWei;
        bool enabled;
    }

    struct RewardCycle {
        uint256 netYieldWei;
        uint256 operationalReserveWei;
        uint256 validatorRewardsWei;
        uint256 ecosystemIncentivesWei;
        uint256 l2l3IncentiveWei;
        uint64 executeAfter;
        bool executed;
        string governanceProposalId;
    }

    mapping(bytes32 => RewardCycle) public cycles;
    DistributionPolicy public policy;
    address public treasuryYieldSource;
    uint256 public accountedYieldWei;
    uint256 public lastQueuedSourceEpoch;
    bool public requireSourceSnapshot;

    uint256 public totalDistributedWei;
    uint256 public totalValidatorRewardsWei;
    uint256 public totalEcosystemIncentivesWei;
    uint256 public totalL2L3IncentiveWei;

    bool public emergencyHalt;
    bool public distributionPaused;

    event RewardCycleQueued(
        bytes32 indexed rewardCycleId,
        string governanceProposalId,
        uint256 netYieldWei,
        uint256 operationalReserveWei,
        uint256 validatorRewardsWei,
        uint256 ecosystemIncentivesWei,
        uint256 l2l3IncentiveWei,
        uint64 executeAfter
    );

    event RewardCycleExecuted(
        bytes32 indexed rewardCycleId,
        uint256 totalDistributedWei,
        uint256 validatorRewardsWei,
        uint256 ecosystemIncentivesWei,
        uint256 l2l3IncentiveWei
    );

    event DistributionFlagsUpdated(bool emergencyHalt, bool distributionPaused);
    event DistributionPolicyUpdated(
        uint16 operationalReserveBps,
        uint16 validatorBps,
        uint16 ecosystemBps,
        uint16 l2l3Bps,
        uint256 minNetYieldWei,
        uint256 maxCycleDistributionWei,
        bool enabled
    );
    event TreasuryYieldSourceUpdated(address indexed previousSource, address indexed nextSource);
    event SourceSnapshotRequirementUpdated(bool required);
    event RewardCycleQueuedFromTreasury(
        bytes32 indexed rewardCycleId,
        string governanceProposalId,
        uint256 netYieldWei,
        uint256 totalYieldWei,
        uint256 sourceEpoch
    );

    modifier whenDistributionEnabled() {
        require(!emergencyHalt, "emergency_halt");
        require(!distributionPaused, "distribution_paused");
        _;
    }

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function setFlags(bool emergencyHalt_, bool distributionPaused_) external onlyGovernance {
        emergencyHalt = emergencyHalt_;
        distributionPaused = distributionPaused_;
        emit DistributionFlagsUpdated(emergencyHalt_, distributionPaused_);
    }

    function setTreasuryYieldSource(address source) external onlyGovernance {
        address previous = treasuryYieldSource;
        treasuryYieldSource = source;
        emit TreasuryYieldSourceUpdated(previous, source);
    }

    function setRequireSourceSnapshot(bool required) external onlyGovernance {
        requireSourceSnapshot = required;
        emit SourceSnapshotRequirementUpdated(required);
    }

    function configureDistributionPolicy(
        uint16 operationalReserveBps,
        uint16 validatorBps,
        uint16 ecosystemBps,
        uint16 l2l3Bps,
        uint256 minNetYieldWei,
        uint256 maxCycleDistributionWei,
        bool enabled
    ) external onlyGovernance {
        uint256 totalBps = uint256(operationalReserveBps) + uint256(validatorBps) + uint256(ecosystemBps) + uint256(l2l3Bps);
        require(totalBps <= 10_000, "bps>10000");
        if (enabled) {
            require(totalBps > 0, "policy_bps=0");
        }

        policy = DistributionPolicy({
            operationalReserveBps: operationalReserveBps,
            validatorBps: validatorBps,
            ecosystemBps: ecosystemBps,
            l2l3Bps: l2l3Bps,
            minNetYieldWei: minNetYieldWei,
            maxCycleDistributionWei: maxCycleDistributionWei,
            enabled: enabled
        });

        emit DistributionPolicyUpdated(
            operationalReserveBps,
            validatorBps,
            ecosystemBps,
            l2l3Bps,
            minNetYieldWei,
            maxCycleDistributionWei,
            enabled
        );
    }

    function previewSplit(
        uint256 netYieldWei,
        uint16 operationalReserveBps,
        uint16 validatorBps,
        uint16 ecosystemBps,
        uint16 l2l3Bps
    )
        public
        pure
        returns (
            uint256 operationalReserveWei,
            uint256 validatorRewardsWei,
            uint256 ecosystemIncentivesWei,
            uint256 l2l3IncentiveWei,
            uint256 totalDistributed
        )
    {
        uint256 totalBps = uint256(operationalReserveBps) + uint256(validatorBps) + uint256(ecosystemBps) + uint256(l2l3Bps);
        require(totalBps <= 10_000, "bps>10000");

        operationalReserveWei = (netYieldWei * operationalReserveBps) / 10_000;
        validatorRewardsWei = (netYieldWei * validatorBps) / 10_000;
        ecosystemIncentivesWei = (netYieldWei * ecosystemBps) / 10_000;
        l2l3IncentiveWei = (netYieldWei * l2l3Bps) / 10_000;
        totalDistributed = operationalReserveWei + validatorRewardsWei + ecosystemIncentivesWei + l2l3IncentiveWei;
        require(totalDistributed <= netYieldWei, "distribution>yield");
    }

    function queueRewardCycle(
        bytes32 rewardCycleId,
        uint256 netYieldWei,
        uint16 operationalReserveBps,
        uint16 validatorBps,
        uint16 ecosystemBps,
        uint16 l2l3Bps,
        uint64 executeAfter,
        string calldata governanceProposalId
    ) external onlyGovernance whenDistributionEnabled {
        (
            uint256 reserveWei,
            uint256 validatorWei,
            uint256 ecosystemWei,
            uint256 l2l3Wei,

        ) = previewSplit(netYieldWei, operationalReserveBps, validatorBps, ecosystemBps, l2l3Bps);

        _queueRewardCycle(
            rewardCycleId,
            governanceProposalId,
            netYieldWei,
            reserveWei,
            validatorWei,
            ecosystemWei,
            l2l3Wei,
            executeAfter
        );
    }

    function previewPolicySplit(uint256 netYieldWei)
        public
        view
        returns (
            uint256 operationalReserveWei,
            uint256 validatorRewardsWei,
            uint256 ecosystemIncentivesWei,
            uint256 l2l3IncentiveWei,
            uint256 totalDistributed
        )
    {
        DistributionPolicy memory p = policy;
        require(p.enabled, "policy_disabled");
        require(netYieldWei >= p.minNetYieldWei, "yield_below_policy_min");

        (operationalReserveWei, validatorRewardsWei, ecosystemIncentivesWei, l2l3IncentiveWei, totalDistributed) =
            previewSplit(netYieldWei, p.operationalReserveBps, p.validatorBps, p.ecosystemBps, p.l2l3Bps);

        if (p.maxCycleDistributionWei > 0) {
            require(totalDistributed <= p.maxCycleDistributionWei, "distribution_over_cycle_cap");
        }
    }

    function queueRewardCycleByPolicy(
        bytes32 rewardCycleId,
        uint256 netYieldWei,
        uint64 executeAfter,
        string calldata governanceProposalId
    ) external onlyGovernance whenDistributionEnabled {
        (
            uint256 reserveWei,
            uint256 validatorWei,
            uint256 ecosystemWei,
            uint256 l2l3Wei,

        ) = previewPolicySplit(netYieldWei);

        _queueRewardCycle(
            rewardCycleId,
            governanceProposalId,
            netYieldWei,
            reserveWei,
            validatorWei,
            ecosystemWei,
            l2l3Wei,
            executeAfter
        );
    }

    function previewTreasuryNetYield()
        public
        view
        returns (uint256 netYieldWei, uint256 totalYieldWei, uint256 accountedYieldWei_)
    {
        address source = treasuryYieldSource;
        require(source != address(0), "source=0");

        totalYieldWei = ISovereignYieldSource(source).yieldReturnedWei();
        accountedYieldWei_ = accountedYieldWei;
        if (totalYieldWei <= accountedYieldWei_) {
            return (0, totalYieldWei, accountedYieldWei_);
        }
        netYieldWei = totalYieldWei - accountedYieldWei_;
    }

    function queueRewardCycleFromTreasury(bytes32 rewardCycleId, uint64 executeAfter, string calldata governanceProposalId)
        external
        onlyGovernance
        whenDistributionEnabled
    {
        address source = treasuryYieldSource;
        require(source != address(0), "source=0");

        uint256 totalYieldWei = ISovereignYieldSource(source).yieldReturnedWei();
        uint256 accounted = accountedYieldWei;
        require(totalYieldWei > accounted, "no_new_net_yield");
        uint256 netYieldWei = totalYieldWei - accounted;

        uint256 sourceEpoch = ISovereignYieldSource(source).latestSolvencyEpoch();
        if (requireSourceSnapshot) {
            require(sourceEpoch != 0, "source_epoch_missing");
            require(ISovereignYieldSource(source).treasurySnapshotExists(sourceEpoch), "source_snapshot_missing");
        }

        (
            uint256 reserveWei,
            uint256 validatorWei,
            uint256 ecosystemWei,
            uint256 l2l3Wei,

        ) = previewPolicySplit(netYieldWei);

        _queueRewardCycle(
            rewardCycleId,
            governanceProposalId,
            netYieldWei,
            reserveWei,
            validatorWei,
            ecosystemWei,
            l2l3Wei,
            executeAfter
        );

        accountedYieldWei = totalYieldWei;
        if (sourceEpoch != 0) {
            lastQueuedSourceEpoch = sourceEpoch;
        }

        emit RewardCycleQueuedFromTreasury(rewardCycleId, governanceProposalId, netYieldWei, totalYieldWei, sourceEpoch);
    }

    function _queueRewardCycle(
        bytes32 rewardCycleId,
        string calldata governanceProposalId,
        uint256 netYieldWei,
        uint256 reserveWei,
        uint256 validatorWei,
        uint256 ecosystemWei,
        uint256 l2l3Wei,
        uint64 executeAfter
    ) internal {
        require(rewardCycleId != bytes32(0), "cycle_id=0");
        require(cycles[rewardCycleId].executeAfter == 0, "cycle_exists");
        require(netYieldWei > 0, "yield=0");
        require(bytes(governanceProposalId).length > 0, "governance_proposal_required");
        require(executeAfter >= block.timestamp, "execute_after<present");

        cycles[rewardCycleId] = RewardCycle({
            netYieldWei: netYieldWei,
            operationalReserveWei: reserveWei,
            validatorRewardsWei: validatorWei,
            ecosystemIncentivesWei: ecosystemWei,
            l2l3IncentiveWei: l2l3Wei,
            executeAfter: executeAfter,
            executed: false,
            governanceProposalId: governanceProposalId
        });

        emit RewardCycleQueued(
            rewardCycleId,
            governanceProposalId,
            netYieldWei,
            reserveWei,
            validatorWei,
            ecosystemWei,
            l2l3Wei,
            executeAfter
        );
    }

    function executeRewardCycle(bytes32 rewardCycleId) external onlyGovernance nonReentrant whenDistributionEnabled {
        RewardCycle storage cycle = cycles[rewardCycleId];
        require(cycle.executeAfter != 0, "cycle_not_found");
        require(!cycle.executed, "cycle_executed");
        require(block.timestamp >= cycle.executeAfter, "timelock_active");

        uint256 distributed =
            cycle.operationalReserveWei + cycle.validatorRewardsWei + cycle.ecosystemIncentivesWei + cycle.l2l3IncentiveWei;
        require(distributed <= cycle.netYieldWei, "distribution>yield");

        cycle.executed = true;

        totalDistributedWei += distributed;
        totalValidatorRewardsWei += cycle.validatorRewardsWei;
        totalEcosystemIncentivesWei += cycle.ecosystemIncentivesWei;
        totalL2L3IncentiveWei += cycle.l2l3IncentiveWei;

        emit RewardCycleExecuted(
            rewardCycleId,
            distributed,
            cycle.validatorRewardsWei,
            cycle.ecosystemIncentivesWei,
            cycle.l2l3IncentiveWei
        );
    }
}
