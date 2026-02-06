// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/ERC20.sol";
import "./ProposalExecutor.sol";

/// @notice Token-based governor for Low Balancer with quorum + timelock execution.
/// @dev Uses staking (token escrow) to prevent vote re-use via transfers during the voting window.
contract LowBalancerGovernor {
    ERC20 public immutable votingToken;
    ProposalExecutor public immutable executor;

    uint256 public votingPeriod;
    uint16 public quorumBps;

    struct Proposal {
        address target;
        uint256 value;
        bytes data;
        uint256 forVotes;
        uint256 againstVotes;
        uint64 start;
        uint64 end;
        bool queued;
        bool executed;
        uint256 queueId;
        uint256 supplySnapshot;
    }

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    mapping(address => uint256) public stakedBalance;
    uint256 public totalStaked;
    mapping(address => uint64) public lockUntil;

    event ProposalCreated(uint256 indexed id, address indexed proposer, address indexed target, uint256 value, bytes data);
    event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight);
    event Queued(uint256 indexed id, uint256 indexed queueId, uint256 eta);
    event Executed(uint256 indexed id, uint256 indexed queueId);

    event Staked(address indexed staker, uint256 amount);
    event Withdrawn(address indexed staker, uint256 amount);
    event VotingPeriodUpdated(uint256 votingPeriod);
    event QuorumBpsUpdated(uint16 quorumBps);

    error VotingClosed();
    error AlreadyVoted();
    error VotingNotEnded();
    error ProposalNotPassed();
    error QuorumNotMet();
    error AlreadyQueued();
    error NotQueued();
    error AlreadyExecuted();
    error NotExecutor();
    error Locked(uint64 until);

    constructor(ERC20 votingToken_, ProposalExecutor executor_, uint256 votingPeriod_, uint16 quorumBps_) {
        require(address(votingToken_) != address(0), "token=0");
        require(address(executor_) != address(0), "executor=0");
        require(votingPeriod_ > 0, "period=0");
        require(quorumBps_ <= 10_000, "bad quorum");

        votingToken = votingToken_;
        executor = executor_;
        votingPeriod = votingPeriod_;
        quorumBps = quorumBps_;

        executor_.setGovernor(address(this));
        emit VotingPeriodUpdated(votingPeriod_);
        emit QuorumBpsUpdated(quorumBps_);
    }

    modifier onlyExecutor() {
        if (msg.sender != address(executor)) revert NotExecutor();
        _;
    }

    function stake(uint256 amount) external {
        require(amount > 0, "amount=0");
        stakedBalance[msg.sender] += amount;
        totalStaked += amount;
        require(votingToken.transferFrom(msg.sender, address(this), amount), "transferFrom");
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        if (block.timestamp < lockUntil[msg.sender]) revert Locked(lockUntil[msg.sender]);
        require(amount > 0, "amount=0");
        uint256 bal = stakedBalance[msg.sender];
        require(bal >= amount, "insufficient");
        unchecked {
            stakedBalance[msg.sender] = bal - amount;
            totalStaked -= amount;
        }
        require(votingToken.transfer(msg.sender, amount), "transfer");
        emit Withdrawn(msg.sender, amount);
    }

    function propose(address target, uint256 value, bytes calldata data) external returns (uint256 id) {
        require(target != address(0), "target=0");
        id = proposals.length;
        proposals.push(
            Proposal({
                target: target,
                value: value,
                data: data,
                forVotes: 0,
                againstVotes: 0,
                start: uint64(block.timestamp),
                end: uint64(block.timestamp + votingPeriod),
                queued: false,
                executed: false,
                queueId: type(uint256).max,
                supplySnapshot: votingToken.totalSupply()
            })
        );
        emit ProposalCreated(id, msg.sender, target, value, data);
    }

    function vote(uint256 id, bool support) external {
        Proposal storage p = proposals[id];
        if (block.timestamp < p.start || block.timestamp > p.end) revert VotingClosed();
        if (hasVoted[id][msg.sender]) revert AlreadyVoted();

        uint256 weight = stakedBalance[msg.sender];
        require(weight > 0, "no stake");

        hasVoted[id][msg.sender] = true;
        if (support) {
            p.forVotes += weight;
        } else {
            p.againstVotes += weight;
        }

        uint64 until = p.end;
        if (until > lockUntil[msg.sender]) {
            lockUntil[msg.sender] = until;
        }

        emit Voted(id, msg.sender, support, weight);
    }

    function queue(uint256 id) external returns (uint256 queueId) {
        Proposal storage p = proposals[id];
        if (p.queued) revert AlreadyQueued();
        if (block.timestamp <= p.end) revert VotingNotEnded();
        if (p.forVotes <= p.againstVotes) revert ProposalNotPassed();
        if (quorumBps != 0) {
            uint256 participation = p.forVotes + p.againstVotes;
            if (participation * 10_000 < p.supplySnapshot * quorumBps) {
                revert QuorumNotMet();
            }
        }

        p.queued = true;
        uint256 expectedQueueId = executor.queueLength();
        p.queueId = expectedQueueId;

        queueId = executor.queueTx(p.target, p.value, p.data);
        require(queueId == expectedQueueId, "queueId mismatch");

        uint256 eta = block.timestamp + executor.delay();
        emit Queued(id, queueId, eta);
    }

    function execute(uint256 id) external {
        Proposal storage p = proposals[id];
        if (!p.queued) revert NotQueued();
        if (p.executed) revert AlreadyExecuted();
        p.executed = true;
        executor.execute(p.queueId);
        emit Executed(id, p.queueId);
    }

    function setVotingPeriod(uint256 votingPeriod_) external onlyExecutor {
        require(votingPeriod_ > 0, "period=0");
        votingPeriod = votingPeriod_;
        emit VotingPeriodUpdated(votingPeriod_);
    }

    function setQuorumBps(uint16 quorumBps_) external onlyExecutor {
        require(quorumBps_ <= 10_000, "bad quorum");
        quorumBps = quorumBps_;
        emit QuorumBpsUpdated(quorumBps_);
    }

    function proposalsLength() external view returns (uint256) {
        return proposals.length;
    }
}
