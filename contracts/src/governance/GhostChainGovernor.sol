// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "./ProposalExecutor.sol";
import "./IVotingPower.sol";
import "./IValidatorSetVotes.sol";
import "./ConstitutionRegistry.sol";

/// @notice Production governor for GhostChain:
/// - vote weight computed on-chain (GST stake votes + validator votes)
/// - snapshot-based voting power at proposal start
/// - standard vs constitutional proposals with supermajority + longer delay (via executor queueTxWithDelay)
/// - executes via ProposalExecutor (which enforces ConstitutionalGuard at execution time)
contract GhostChainGovernor is Governed {
    ProposalExecutor public immutable executor;
    IVotingPower public immutable gstStakingVotes;
    IValidatorSetVotes public immutable validatorVotes;
    ConstitutionRegistry public immutable constitutionRegistry;

    uint64 public votingDelay = 1 days;
    uint64 public votingPeriod = 5 days;

    struct Proposal {
        address target;
        uint256 value;
        bytes data;
        bytes32 descriptionHash;

        uint64 start;
        uint64 end;
        uint256 forVotes;
        uint256 againstVotes;

        bool constitutional;
        bool amendment;

        bool queued;
        bool executed;
        uint256 queueId;
    }

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed id, address indexed proposer, address indexed target, bool constitutional, bool amendment);
    event VoteCast(uint256 indexed id, address indexed voter, bool support, uint256 weight);
    event Queued(uint256 indexed id, uint256 indexed queueId, uint256 eta, uint256 delaySeconds);
    event Executed(uint256 indexed id, uint256 indexed queueId);

    error VotingClosed();
    error AlreadyVoted();
    error VotingNotEnded();
    error ProposalNotPassed();
    error QuorumNotMet();
    error SupermajorityNotMet();
    error AlreadyQueued();
    error NotQueued();
    error AlreadyExecuted();
    error NoVotingPower();
    error DelayTooShort();

    constructor(
        address governor_,
        address timelock_,
        ProposalExecutor executor_,
        IVotingPower gstStakingVotes_,
        IValidatorSetVotes validatorVotes_,
        ConstitutionRegistry constitutionRegistry_
    ) Governed(governor_, timelock_) {
        require(address(executor_) != address(0), "executor=0");
        require(address(gstStakingVotes_) != address(0), "stakeVotes=0");
        require(address(validatorVotes_) != address(0), "validatorVotes=0");
        require(address(constitutionRegistry_) != address(0), "constitution=0");

        executor = executor_;
        gstStakingVotes = gstStakingVotes_;
        validatorVotes = validatorVotes_;
        constitutionRegistry = constitutionRegistry_;

        // Bind executor to this governor.
        executor_.setGovernor(address(this));
    }

    function proposalsLength() external view returns (uint256) {
        return proposals.length;
    }

    function setVotingDelay(uint64 delaySeconds) external onlyExecutor {
        require(delaySeconds > 0, "delay=0");
        votingDelay = delaySeconds;
    }

    function setVotingPeriod(uint64 periodSeconds) external onlyExecutor {
        require(periodSeconds > 0, "period=0");
        votingPeriod = periodSeconds;
    }

    /// @notice Standard proposal (non-constitutional).
    function propose(address target, uint256 value, bytes calldata data) external returns (uint256 id) {
        return _propose(target, value, data, bytes32(0), false, false);
    }

    /// @notice Explicit standard/constitutional proposal.
    function proposeAdvanced(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 descriptionHash,
        bool constitutional,
        bool amendment
    ) external returns (uint256 id) {
        return _propose(target, value, data, descriptionHash, constitutional, amendment);
    }

    function _propose(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 descriptionHash,
        bool constitutional,
        bool amendment
    ) internal returns (uint256 id) {
        require(target != address(0), "target=0");
        id = proposals.length;
        uint64 start = uint64(block.timestamp + votingDelay);
        uint64 end = uint64(uint256(start) + uint256(votingPeriod));
        proposals.push(
            Proposal({
                target: target,
                value: value,
                data: data,
                descriptionHash: descriptionHash,
                start: start,
                end: end,
                forVotes: 0,
                againstVotes: 0,
                constitutional: constitutional,
                amendment: amendment,
                queued: false,
                executed: false,
                queueId: type(uint256).max
            })
        );
        emit ProposalCreated(id, msg.sender, target, constitutional, amendment);
    }

    function castVote(uint256 id, bool support) external {
        Proposal storage p = proposals[id];
        if (block.timestamp < p.start || block.timestamp > p.end) revert VotingClosed();
        if (hasVoted[id][msg.sender]) revert AlreadyVoted();
        hasVoted[id][msg.sender] = true;

        uint256 weight = _votingPowerAt(msg.sender, p.start);
        if (weight == 0) revert NoVotingPower();

        if (support) p.forVotes += weight;
        else p.againstVotes += weight;

        emit VoteCast(id, msg.sender, support, weight);
    }

    function queue(uint256 id, uint256 delaySeconds) external returns (uint256 queueId) {
        Proposal storage p = proposals[id];
        if (p.queued) revert AlreadyQueued();
        if (block.timestamp <= p.end) revert VotingNotEnded();

        ConstitutionRegistry.AmendmentRules memory r = _rules();

        if (p.constitutional) {
            if (p.forVotes < r.constitutionalQuorum) revert QuorumNotMet();
            uint256 participation = p.forVotes + p.againstVotes;
            if (participation == 0) revert QuorumNotMet();
            if (p.forVotes * 10_000 < participation * uint256(r.constitutionalSupermajorityBps)) {
                revert SupermajorityNotMet();
            }
            if (delaySeconds < r.constitutionalMinDelay) revert DelayTooShort();
        } else {
            if (p.forVotes < r.standardQuorum) revert QuorumNotMet();
            if (p.forVotes <= p.againstVotes) revert ProposalNotPassed();
            if (delaySeconds < r.standardMinDelay) revert DelayTooShort();
        }

        p.queued = true;
        uint256 expectedQueueId = executor.queueLength();
        p.queueId = expectedQueueId;

        queueId = executor.queueTxWithDelay(p.target, p.value, p.data, delaySeconds);
        require(queueId == expectedQueueId, "queueId mismatch");

        emit Queued(id, queueId, block.timestamp + delaySeconds, delaySeconds);
    }

    function execute(uint256 id) external {
        Proposal storage p = proposals[id];
        if (!p.queued) revert NotQueued();
        if (p.executed) revert AlreadyExecuted();
        p.executed = true;
        executor.execute(p.queueId);
        emit Executed(id, p.queueId);
    }

    function _votingPowerAt(address voter, uint64 timepoint) internal view returns (uint256) {
        uint256 stake = gstStakingVotes.getVotes(voter, uint256(timepoint));
        uint256 val = validatorVotes.getValidatorVotes(voter, uint256(timepoint));
        unchecked {
            return stake + val;
        }
    }

    function _rules() internal view returns (ConstitutionRegistry.AmendmentRules memory r) {
        // Solidity will return the struct via ABI encoding; wrap in a helper to keep call sites clean.
        (
            uint256 standardQuorum,
            uint256 constitutionalQuorum,
            uint16 constitutionalSupermajorityBps,
            uint256 standardMinDelay,
            uint256 constitutionalMinDelay,
            bool ratchetOnly
        ) = constitutionRegistry.rules();
        r = ConstitutionRegistry.AmendmentRules({
            standardQuorum: standardQuorum,
            constitutionalQuorum: constitutionalQuorum,
            constitutionalSupermajorityBps: constitutionalSupermajorityBps,
            standardMinDelay: standardMinDelay,
            constitutionalMinDelay: constitutionalMinDelay,
            ratchetOnly: ratchetOnly
        });
    }
}

