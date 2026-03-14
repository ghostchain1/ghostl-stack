// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/GhostHash.sol";

interface IGhostTimelockController {
    function schedule(address target, uint256 value, bytes calldata data, bytes32 salt) external returns (bytes32);
    function execute(address target, uint256 value, bytes calldata data, bytes32 salt) external payable returns (bytes memory);
}

/// @notice Minimal address-based governor intended for environment gating only.
///         Each configured voter has 1 vote. This is not token-weighted governance.
///         The execution path is routed through a timelock.
contract GhostGovernanceGovernor {
    error Unauthorized();
    error ProposalNotFound();
    error VotingClosed();
    error AlreadyVoted();
    error NotSuccessful();
    error AlreadyQueued();
    error AlreadyExecuted();

    address public admin;
    IGhostTimelockController public timelock;

    uint64 public votingPeriodSeconds;
    uint64 public quorumVotes;

    mapping(address => bool) public voters;

    struct Proposal {
        address target;
        uint256 value;
        bytes data;
        uint64 start;
        uint64 end;
        uint64 forVotes;
        uint64 againstVotes;
        bool queued;
        bool executed;
        bytes32 descriptionHash;
    }

    uint256 public proposalNonce;
    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => mapping(address => bool)) public hasVoted;

    event AdminChanged(address indexed previousAdmin, address indexed newAdmin);
    event VoterSet(address indexed voter, bool allowed);
    event ProposalCreated(bytes32 indexed proposalId, address indexed proposer, address indexed target, bytes32 descriptionHash);
    event VoteCast(bytes32 indexed proposalId, address indexed voter, bool support);
    event ProposalQueued(bytes32 indexed proposalId);
    event ProposalExecuted(bytes32 indexed proposalId);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyVoter() {
        if (!voters[msg.sender]) revert Unauthorized();
        _;
    }

    constructor(address timelock_, uint64 votingPeriodSeconds_, uint64 quorumVotes_, address admin_) {
        timelock = IGhostTimelockController(timelock_);
        votingPeriodSeconds = votingPeriodSeconds_;
        quorumVotes = quorumVotes_;
        admin = admin_ == address(0) ? msg.sender : admin_;
        voters[admin] = true;
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "zero_admin");
        emit AdminChanged(admin, newAdmin);
        admin = newAdmin;
    }

    function setVoter(address voter, bool allowed) external onlyAdmin {
        voters[voter] = allowed;
        emit VoterSet(voter, allowed);
    }

    function setVotingParams(uint64 votingPeriodSeconds_, uint64 quorumVotes_) external onlyAdmin {
        votingPeriodSeconds = votingPeriodSeconds_;
        quorumVotes = quorumVotes_;
    }

    function propose(address target, uint256 value, bytes calldata data, string calldata description)
        external
        onlyVoter
        returns (bytes32 proposalId)
    {
        bytes32 descriptionHash = keccak256(bytes(description));
        proposalId = GhostHash.governorProposalId(++proposalNonce, target, value, keccak256(data), descriptionHash);

        Proposal storage p = proposals[proposalId];
        p.target = target;
        p.value = value;
        p.data = data;
        p.start = uint64(block.timestamp);
        p.end = uint64(block.timestamp) + votingPeriodSeconds;
        p.descriptionHash = descriptionHash;

        emit ProposalCreated(proposalId, msg.sender, target, descriptionHash);
    }

    function vote(bytes32 proposalId, bool support) external onlyVoter {
        Proposal storage p = proposals[proposalId];
        if (p.start == 0) revert ProposalNotFound();
        if (block.timestamp > p.end) revert VotingClosed();
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted();
        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            p.forVotes += 1;
        } else {
            p.againstVotes += 1;
        }

        emit VoteCast(proposalId, msg.sender, support);
    }

    function isSuccessful(bytes32 proposalId) public view returns (bool) {
        Proposal storage p = proposals[proposalId];
        if (p.start == 0) return false;
        if (block.timestamp <= p.end) return false;
        if (p.forVotes < quorumVotes) return false;
        return p.forVotes > p.againstVotes;
    }

    function queue(bytes32 proposalId) external onlyVoter returns (bytes32 opId) {
        Proposal storage p = proposals[proposalId];
        if (p.start == 0) revert ProposalNotFound();
        if (p.queued) revert AlreadyQueued();
        if (!isSuccessful(proposalId)) revert NotSuccessful();

        p.queued = true;
        opId = timelock.schedule(p.target, p.value, p.data, proposalId);
        emit ProposalQueued(proposalId);
    }

    function execute(bytes32 proposalId) external payable onlyVoter returns (bytes memory returndata) {
        Proposal storage p = proposals[proposalId];
        if (p.start == 0) revert ProposalNotFound();
        if (p.executed) revert AlreadyExecuted();
        if (!p.queued) revert NotSuccessful();

        p.executed = true;
        returndata = timelock.execute{value: msg.value}(p.target, p.value, p.data, proposalId);
        emit ProposalExecuted(proposalId);
    }
}

