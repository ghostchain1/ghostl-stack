// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  CentralBankGovernance
/// @notice Governance council for GCM. Voting weight is proportional to reserve holdings.
///         Controls monetary policy, liquidity, and crisis response decisions.
contract CentralBankGovernance {

    struct Proposal {
        string  description;
        address target;
        bytes   callData;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 deadline;
        bool    executed;
        bool    cancelled;
    }

    mapping(address => uint256) public reserveWeight;  // weight per central bank
    mapping(address => bool)    public isCouncilMember;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    uint256 public proposalCount;
    uint256 public totalWeight;
    uint256 public votingPeriod = 3 days;
    uint256 public quorumBps    = 6700; // 67% supermajority
    address public admin;

    event ProposalCreated(uint256 indexed id, string description, uint256 deadline);
    event VoteCast(uint256 indexed id, address member, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed id);
    event ProposalCancelled(uint256 indexed id);
    event MemberAdded(address indexed bank, uint256 weight);
    event WeightUpdated(address indexed bank, uint256 weight);

    modifier onlyAdmin()  { require(msg.sender == admin, "CBGov: not admin"); _; }
    modifier onlyMember() { require(isCouncilMember[msg.sender], "CBGov: not member"); _; }

    constructor() { admin = msg.sender; }

    function addMember(address bank, uint256 weight) external onlyAdmin {
        require(!isCouncilMember[bank], "CBGov: already member");
        isCouncilMember[bank] = true;
        reserveWeight[bank]   = weight;
        totalWeight          += weight;
        emit MemberAdded(bank, weight);
    }

    function updateWeight(address bank, uint256 weight) external onlyAdmin {
        require(isCouncilMember[bank], "CBGov: not member");
        totalWeight        -= reserveWeight[bank];
        reserveWeight[bank] = weight;
        totalWeight        += weight;
        emit WeightUpdated(bank, weight);
    }

    function propose(
        string memory description,
        address target,
        bytes memory callData
    ) external onlyMember returns (uint256 id) {
        id = proposalCount++;
        proposals[id] = Proposal({
            description:  description,
            target:       target,
            callData:     callData,
            votesFor:     0,
            votesAgainst: 0,
            deadline:     block.timestamp + votingPeriod,
            executed:     false,
            cancelled:    false
        });
        emit ProposalCreated(id, description, proposals[id].deadline);
    }

    function vote(uint256 id, bool support) external onlyMember {
        Proposal storage p = proposals[id];
        require(block.timestamp <= p.deadline, "CBGov: voting closed");
        require(!p.cancelled, "CBGov: cancelled");
        require(!hasVoted[id][msg.sender], "CBGov: already voted");
        hasVoted[id][msg.sender] = true;
        uint256 w = reserveWeight[msg.sender];
        if (support) p.votesFor     += w;
        else         p.votesAgainst += w;
        emit VoteCast(id, msg.sender, support, w);
    }

    function execute(uint256 id) external onlyAdmin {
        Proposal storage p = proposals[id];
        require(block.timestamp > p.deadline, "CBGov: voting not ended");
        require(!p.executed && !p.cancelled, "CBGov: already finalized");
        uint256 totalVotes = p.votesFor + p.votesAgainst;
        require(totalWeight > 0 && (totalVotes * 10_000 / totalWeight) >= quorumBps, "CBGov: no quorum");
        require(p.votesFor > p.votesAgainst, "CBGov: not passed");
        p.executed = true;
        (bool ok,) = p.target.call(p.callData);
        require(ok, "CBGov: execution failed");
        emit ProposalExecuted(id);
    }

    function cancel(uint256 id) external onlyAdmin {
        proposals[id].cancelled = true;
        emit ProposalCancelled(id);
    }
}
