// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GSAGovernance — AI-assisted on-chain governance for GhostStack policy
contract GSAGovernance {

    enum ProposalType {
        PARAMETER_CHANGE,   // update a system parameter
        AGENT_ACTIVATION,   // activate a new AI agent
        POLICY_UPDATE,      // update economic/identity policy
        EMERGENCY_ACTION,   // fast-track emergency measure
        SYSTEM_UPGRADE      // upgrade a subsystem
    }

    struct Proposal {
        string       title;
        string       description;
        ProposalType pType;
        address      target;
        bytes        callData;
        bytes32      aiAgentId;     // agent that proposed (or 0x0 for humans)
        uint256      votesFor;
        uint256      votesAgainst;
        uint256      deadline;
        bool         executed;
        bool         vetoed;
    }

    uint256 public nextProposalId;
    mapping(uint256 => Proposal)                           public proposals;
    mapping(uint256 => mapping(address => uint256))        public voteCast;   // weight cast
    mapping(address => uint256)                            public votingPower; // staked weight

    address public admin;
    address public agentRegistry;
    uint256 public constant EMERGENCY_QUORUM_BPS = 1000;   // 10%
    uint256 public constant STANDARD_QUORUM_BPS  = 3000;   // 30%
    uint256 public totalVotingPower;

    event ProposalCreated(uint256 indexed id, string title, ProposalType pType, bytes32 agentId);
    event VoteCast(uint256 indexed id, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed id, bool success);
    event ProposalVetoed(uint256 indexed id, string reason);
    event VotingPowerSet(address indexed account, uint256 power);

    modifier onlyAdmin() {
        require(msg.sender == admin, "GSAGovernance: not admin");
        _;
    }

    constructor(address _agentRegistry) {
        admin          = msg.sender;
        agentRegistry  = _agentRegistry;
        votingPower[msg.sender] = 100;
        totalVotingPower = 100;
    }

    function setVotingPower(address account, uint256 power) external onlyAdmin {
        totalVotingPower = totalVotingPower - votingPower[account] + power;
        votingPower[account] = power;
        emit VotingPowerSet(account, power);
    }

    function propose(
        string       calldata title,
        string       calldata description,
        ProposalType pType,
        address      target,
        bytes        calldata callData,
        bytes32      aiAgentId,
        uint256      durationSeconds
    ) external returns (uint256 id) {
        require(votingPower[msg.sender] > 0, "GSAGovernance: no voting power");
        id = nextProposalId++;
        proposals[id] = Proposal({
            title:        title,
            description:  description,
            pType:        pType,
            target:       target,
            callData:     callData,
            aiAgentId:    aiAgentId,
            votesFor:     0,
            votesAgainst: 0,
            deadline:     block.timestamp + durationSeconds,
            executed:     false,
            vetoed:       false
        });
        emit ProposalCreated(id, title, pType, aiAgentId);
    }

    function vote(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp <= p.deadline, "GSAGovernance: voting closed");
        require(!p.vetoed, "GSAGovernance: vetoed");
        uint256 w = votingPower[msg.sender];
        require(w > 0, "GSAGovernance: no voting power");
        require(voteCast[proposalId][msg.sender] == 0, "GSAGovernance: already voted");
        voteCast[proposalId][msg.sender] = w;
        if (support) p.votesFor     += w;
        else         p.votesAgainst += w;
        emit VoteCast(proposalId, msg.sender, support, w);
    }

    function execute(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp > p.deadline, "GSAGovernance: voting open");
        require(!p.executed && !p.vetoed, "GSAGovernance: invalid state");
        require(p.votesFor > p.votesAgainst, "GSAGovernance: did not pass");

        uint256 minQuorum = p.pType == ProposalType.EMERGENCY_ACTION
            ? EMERGENCY_QUORUM_BPS
            : STANDARD_QUORUM_BPS;
        uint256 participation = ((p.votesFor + p.votesAgainst) * 10000) / totalVotingPower;
        require(participation >= minQuorum, "GSAGovernance: quorum not met");

        p.executed = true;
        (bool success,) = p.target.call(p.callData);
        emit ProposalExecuted(proposalId, success);
    }

    function veto(uint256 proposalId, string calldata reason) external onlyAdmin {
        proposals[proposalId].vetoed = true;
        emit ProposalVetoed(proposalId, reason);
    }
}
