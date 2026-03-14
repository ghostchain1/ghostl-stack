// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EconomicGovernance — GDP-weighted proposal voting for sovereign economic policy
contract EconomicGovernance {

    struct Proposal {
        string   description;
        uint256  votesFor;
        uint256  votesAgainst;
        uint256  deadline;
        bool     executed;
        bool     passed;
    }

    uint256 public nextProposalId;
    mapping(uint256 => Proposal)                    public proposals;
    mapping(uint256 => mapping(address => bool))    public hasVoted;

    // nation → GDP weight (set by governance, e.g. GDP in billions USD)
    mapping(address => uint256) public gdpWeight;
    address public admin;

    uint256 public constant MIN_QUORUM_BPS = 3000; // 30% of total weight must participate

    event ProposalCreated(uint256 indexed id, string description, uint256 deadline);
    event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed id, bool passed);

    modifier onlyAdmin() {
        require(msg.sender == admin, "EconomicGovernance: not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function setGDPWeight(address nation, uint256 weight) external onlyAdmin {
        gdpWeight[nation] = weight;
    }

    function createProposal(string calldata description, uint256 durationSeconds)
        external onlyAdmin returns (uint256 id)
    {
        id = nextProposalId++;
        proposals[id] = Proposal(description, 0, 0, block.timestamp + durationSeconds, false, false);
        emit ProposalCreated(id, description, proposals[id].deadline);
    }

    function vote(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp <= p.deadline, "EconomicGovernance: voting closed");
        require(!hasVoted[proposalId][msg.sender], "EconomicGovernance: already voted");
        uint256 weight = gdpWeight[msg.sender];
        require(weight > 0, "EconomicGovernance: no voting weight");
        hasVoted[proposalId][msg.sender] = true;
        if (support) p.votesFor += weight;
        else         p.votesAgainst += weight;
        emit Voted(proposalId, msg.sender, support, weight);
    }

    function execute(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp > p.deadline, "EconomicGovernance: voting not closed");
        require(!p.executed, "EconomicGovernance: already executed");
        p.executed = true;
        p.passed = p.votesFor > p.votesAgainst;
        emit ProposalExecuted(proposalId, p.passed);
    }
}
