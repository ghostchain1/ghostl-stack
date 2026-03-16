// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "../common/Ownable.sol";
import "../common/GST20.sol";
import "./ProposalExecutor.sol";

/// @notice Simplified token-based governor with timelock execution.
contract Governor is Ownable {
    GST20 public votingToken;
    ProposalExecutor public executor;

    struct Proposal {
        address target;
        uint256 value;
        bytes data;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 start;
        uint256 end;
        bool queued;
        bool executed;
    }

    mapping(uint256 => mapping(address => bool)) public hasVoted;
    Proposal[] public proposals;
    uint256 public votingPeriod = 3 days;

    event ProposalCreated(uint256 indexed id, address indexed target, uint256 value, bytes data);
    event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight);
    event Queued(uint256 indexed id, uint256 eta);
    event Executed(uint256 indexed id);

    constructor(GST20 _votingToken, ProposalExecutor _executor) {
        votingToken = _votingToken;
        executor = _executor;
        executor.setGovernor(address(this));
    }

    function setVotingPeriod(uint256 period) external onlyOwner {
        votingPeriod = period;
    }

    function propose(address target, uint256 value, bytes calldata data) external returns (uint256 id) {
        id = proposals.length;
        proposals.push(
            Proposal({
                target: target,
                value: value,
                data: data,
                forVotes: 0,
                againstVotes: 0,
                start: block.timestamp,
                end: block.timestamp + votingPeriod,
                queued: false,
                executed: false
            })
        );
        emit ProposalCreated(id, target, value, data);
    }

    function vote(uint256 id, bool support) external {
        Proposal storage p = proposals[id];
        require(block.timestamp >= p.start && block.timestamp <= p.end, "voting closed");
        require(!hasVoted[id][msg.sender], "already voted");
        uint256 weight = votingToken.balanceOf(msg.sender);
        hasVoted[id][msg.sender] = true;
        if (support) p.forVotes += weight;
        else p.againstVotes += weight;
        emit Voted(id, msg.sender, support, weight);
    }

    function queue(uint256 id) external onlyOwner {
        Proposal storage p = proposals[id];
        require(!p.queued, "queued");
        require(p.forVotes > p.againstVotes, "not passed");
        uint256 eta = block.timestamp + executor.delay();
        p.queued = true;
        // slither-disable-next-line unused-return
        require(executor.queueLength() == id, "queue mismatch");
        uint256 queueId = executor.queueTx(p.target, p.value, p.data);
        require(queueId == id, "queue mismatch");
        emit Queued(id, eta);
    }

    function execute(uint256 id) external onlyOwner {
        Proposal storage p = proposals[id];
        require(p.queued, "not queued");
        require(!p.executed, "executed");
        p.executed = true;
        // slither-disable-next-line unused-return
        executor.execute(id);
        emit Executed(id);
    }

    function proposalsLength() external view returns (uint256) {
        return proposals.length;
    }
}
