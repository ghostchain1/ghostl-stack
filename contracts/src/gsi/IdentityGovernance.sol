// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IdentityGovernance — controls issuer authority, revocation rules, and policy updates
contract IdentityGovernance {

    struct Policy {
        string   description;
        bytes    callData;      // encoded call to execute on target
        address  target;
        uint256  votesFor;
        uint256  votesAgainst;
        uint256  deadline;
        bool     executed;
    }

    uint256 public nextPolicyId;
    mapping(uint256 => Policy)                     public policies;
    mapping(uint256 => mapping(address => bool))   public hasVoted;
    mapping(address => bool)                       public governors;
    mapping(address => uint256)                    public votingWeight; // e.g. 1 per governor

    address public admin;

    event GovernorSet(address indexed governor, bool status);
    event PolicyProposed(uint256 indexed id, string description, uint256 deadline);
    event VoteCast(uint256 indexed id, address indexed governor, bool support);
    event PolicyExecuted(uint256 indexed id, bool success);

    modifier onlyAdmin() {
        require(msg.sender == admin, "IdentityGovernance: not admin");
        _;
    }

    modifier onlyGovernor() {
        require(governors[msg.sender] || msg.sender == admin,
            "IdentityGovernance: not governor");
        _;
    }

    constructor() {
        admin = msg.sender;
        governors[msg.sender] = true;
        votingWeight[msg.sender] = 1;
    }

    function setGovernor(address governor, bool status, uint256 weight) external onlyAdmin {
        governors[governor] = status;
        votingWeight[governor] = weight;
        emit GovernorSet(governor, status);
    }

    function proposePolicy(
        string  calldata description,
        address target,
        bytes   calldata callData,
        uint256 durationSeconds
    ) external onlyGovernor returns (uint256 id) {
        id = nextPolicyId++;
        policies[id] = Policy({
            description:  description,
            callData:     callData,
            target:       target,
            votesFor:     0,
            votesAgainst: 0,
            deadline:     block.timestamp + durationSeconds,
            executed:     false
        });
        emit PolicyProposed(id, description, policies[id].deadline);
    }

    function vote(uint256 policyId, bool support) external onlyGovernor {
        Policy storage p = policies[policyId];
        require(block.timestamp <= p.deadline, "IdentityGovernance: voting closed");
        require(!hasVoted[policyId][msg.sender], "IdentityGovernance: already voted");
        hasVoted[policyId][msg.sender] = true;
        uint256 w = votingWeight[msg.sender];
        if (support) p.votesFor += w;
        else         p.votesAgainst += w;
        emit VoteCast(policyId, msg.sender, support);
    }

    function executePolicy(uint256 policyId) external onlyGovernor {
        Policy storage p = policies[policyId];
        require(block.timestamp > p.deadline, "IdentityGovernance: voting open");
        require(!p.executed, "IdentityGovernance: already executed");
        require(p.votesFor > p.votesAgainst, "IdentityGovernance: did not pass");
        p.executed = true;
        (bool success,) = p.target.call(p.callData);
        emit PolicyExecuted(policyId, success);
    }
}
