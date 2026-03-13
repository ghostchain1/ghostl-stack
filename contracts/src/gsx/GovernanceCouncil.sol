// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

/// @title  GovernanceCouncil
/// @notice Sovereign governance for GSX. Reserve-weighted voting.
///         Controls reserve approvals, parameter changes, and emergency actions.
contract GovernanceCouncil {

    enum ProposalType   { ParameterChange, ReserveApproval, EmergencyAction, MemberChange }
    enum ProposalStatus { Active, Passed, Rejected, Executed, Cancelled }

    struct Proposal {
        uint256        id;
        ProposalType   pType;
        string         description;
        bytes          callData;
        address        target;
        address        proposer;
        uint256        votesFor;
        uint256        votesAgainst;
        ProposalStatus status;
        uint256        deadline;
    }

    mapping(address  => uint256) public voteWeight;
    mapping(address  => bool)    public members;
    mapping(uint256  => Proposal) public proposals;
    mapping(uint256  => mapping(address => bool)) public voted;

    uint256 public proposalCount;
    uint256 public votingPeriod = 7 days;
    uint256 public quorumBps    = 5100; // 51% of total weight
    uint256 public totalWeight;
    address public admin;

    event ProposalCreated(uint256 indexed id, ProposalType pType, string description, uint256 deadline);
    event Voted(uint256 indexed id, address member, bool support, uint256 weight);
    event ProposalFinalized(uint256 indexed id, ProposalStatus status);
    event ProposalExecuted(uint256 indexed id);
    event MemberAdded(address indexed member, uint256 weight);
    event WeightUpdated(address indexed member, uint256 weight);

    modifier onlyAdmin()  { require(msg.sender == admin, "Council: not admin"); _; }
    modifier onlyMember() { require(members[msg.sender], "Council: not member"); _; }

    constructor() { admin = msg.sender; }

    function addMember(address m, uint256 weight) external onlyAdmin {
        require(!members[m], "Council: already member");
        members[m]    = true;
        voteWeight[m] = weight;
        totalWeight  += weight;
        emit MemberAdded(m, weight);
    }

    function updateWeight(address m, uint256 weight) external onlyAdmin {
        require(members[m], "Council: not member");
        totalWeight  -= voteWeight[m];
        voteWeight[m] = weight;
        totalWeight  += weight;
        emit WeightUpdated(m, weight);
    }

    function propose(
        ProposalType  pType,
        string memory description,
        address       target,
        bytes memory  callData
    ) external onlyMember returns (uint256 id) {
        id = proposalCount++;
        uint256 deadline = block.timestamp + votingPeriod;
        proposals[id] = Proposal({
            id:           id,
            pType:        pType,
            description:  description,
            callData:     callData,
            target:       target,
            proposer:     msg.sender,
            votesFor:     0,
            votesAgainst: 0,
            status:       ProposalStatus.Active,
            deadline:     deadline
        });
        emit ProposalCreated(id, pType, description, deadline);
    }

    function vote(uint256 id, bool support) external onlyMember {
        Proposal storage p = proposals[id];
        require(p.status == ProposalStatus.Active, "Council: not active");
        require(block.timestamp <= p.deadline, "Council: voting closed");
        require(!voted[id][msg.sender], "Council: already voted");
        voted[id][msg.sender] = true;
        uint256 w = voteWeight[msg.sender];
        if (support) p.votesFor     += w;
        else         p.votesAgainst += w;
        emit Voted(id, msg.sender, support, w);
    }

    function finalize(uint256 id) external {
        Proposal storage p = proposals[id];
        require(p.status == ProposalStatus.Active, "Council: not active");
        require(block.timestamp > p.deadline, "Council: voting ongoing");
        uint256 totalVotes = p.votesFor + p.votesAgainst;
        bool quorumMet = totalWeight > 0 && (totalVotes * 10_000 / totalWeight) >= quorumBps;
        bool passed    = quorumMet && p.votesFor > p.votesAgainst;
        p.status = passed ? ProposalStatus.Passed : ProposalStatus.Rejected;
        emit ProposalFinalized(id, p.status);
    }

    function execute(uint256 id) external onlyAdmin {
        Proposal storage p = proposals[id];
        require(p.status == ProposalStatus.Passed, "Council: not passed");
        p.status = ProposalStatus.Executed;
        (bool ok,) = p.target.call(p.callData);
        require(ok, "Council: execution failed");
        emit ProposalExecuted(id);
    }
}
