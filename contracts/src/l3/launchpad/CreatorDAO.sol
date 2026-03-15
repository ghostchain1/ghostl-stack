// GhostChain Contracts v5.6.1 (contracts/src/l3/launchpad/CreatorDAO.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../../GhostBrand.sol";
import {GhostReentrancyGuard} from "../../ghost/GhostReentrancyGuard.sol";
import {IGRC20} from "../../ghost/IGRC20.sol";

/// @title  CreatorDAO
/// @notice Fan token-weighted governance on GhostL3.
///         Any fan holding ≥1 token-unit of the relevant CreatorToken may cast a
///         vote on a proposal.  Vote weight equals their token balance at the time
///         of voting (snapshot-less, gas-efficient model).
///         Proposals are advisory by default; the creator (token owner) executes
///         ratified proposals manually after the voting window closes.
contract CreatorDAO is GhostBrand, GhostReentrancyGuard {
    // ── Errors ────────────────────────────────────────────────────────────────
    error DAO__WrongChain(uint256 expected, uint256 actual);
    error DAO__NotFound(bytes32 proposalId);
    error DAO__AlreadyExists(bytes32 proposalId);
    error DAO__VotingClosed(bytes32 proposalId);
    error DAO__AlreadyVoted(bytes32 proposalId, address voter);
    error DAO__NoVotingPower(address voter);
    error DAO__InvalidParams();
    error DAO__VotingNotEnded(bytes32 proposalId);
    error DAO__AlreadyExecuted(bytes32 proposalId);

    // ── Events ────────────────────────────────────────────────────────────────
    event ProposalCreated(
        bytes32 indexed proposalId,
        address indexed token,
        address indexed proposer,
        string  description,
        uint256 endsAt
    );
    event VoteCast(
        bytes32 indexed proposalId,
        address indexed voter,
        bool    support,
        uint256 weight
    );
    event ProposalExecuted(bytes32 indexed proposalId, bool passed);

    // ── Data ──────────────────────────────────────────────────────────────────

    struct Proposal {
        address  token;          // CreatorToken voters must hold
        address  proposer;
        string   description;
        uint256  votesFor;
        uint256  votesAgainst;
        uint256  endsAt;
        bool     executed;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    mapping(bytes32 => Proposal)                         public proposals;
    mapping(bytes32 => mapping(address => bool))         public hasVoted;

    /// @notice Minimum voting period enforced on all proposals (62 400 blocks ≈ 1 week at 1 s/block)
    uint256 public constant MIN_VOTING_PERIOD = 1 days;

    // ── Proposal creation ─────────────────────────────────────────────────────

    /// @notice Create a new governance proposal.
    /// @param proposalId   Unique off-chain deterministic ID
    /// @param token        Fan token whose holders vote
    /// @param description  Plain-text or IPFS URI description
    /// @param votingPeriod Seconds the vote stays open (≥ MIN_VOTING_PERIOD)
    function propose(
        bytes32        proposalId,
        address        token,
        string calldata description,
        uint256        votingPeriod
    ) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert DAO__WrongChain(L3_CHAIN_ID, block.chainid);
        if (proposals[proposalId].token != address(0)) revert DAO__AlreadyExists(proposalId);
        if (token == address(0)) revert DAO__InvalidParams();
        if (bytes(description).length == 0) revert DAO__InvalidParams();
        if (votingPeriod < MIN_VOTING_PERIOD) revert DAO__InvalidParams();

        // Proposer must hold at least 1 token unit
        uint256 power = IGRC20(token).balanceOf(msg.sender);
        if (power == 0) revert DAO__NoVotingPower(msg.sender);

        proposals[proposalId] = Proposal({
            token:        token,
            proposer:     msg.sender,
            description:  description,
            votesFor:     0,
            votesAgainst: 0,
            endsAt:       block.timestamp + votingPeriod,
            executed:     false
        });

        emit ProposalCreated(proposalId, token, msg.sender, description, block.timestamp + votingPeriod);
    }

    // ── Voting ────────────────────────────────────────────────────────────────

    /// @notice Cast a vote weighted by the caller's current fan-token balance.
    /// @param proposalId Proposal to vote on
    /// @param support    true = vote FOR, false = vote AGAINST
    function vote(bytes32 proposalId, bool support) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert DAO__WrongChain(L3_CHAIN_ID, block.chainid);

        Proposal storage p = proposals[proposalId];
        if (p.token == address(0)) revert DAO__NotFound(proposalId);
        if (block.timestamp > p.endsAt) revert DAO__VotingClosed(proposalId);
        if (hasVoted[proposalId][msg.sender]) revert DAO__AlreadyVoted(proposalId, msg.sender);

        uint256 weight = IGRC20(p.token).balanceOf(msg.sender);
        if (weight == 0) revert DAO__NoVotingPower(msg.sender);

        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            p.votesFor += weight;
        } else {
            p.votesAgainst += weight;
        }

        emit VoteCast(proposalId, msg.sender, support, weight);
    }

    // ── Execution flag ────────────────────────────────────────────────────────

    /// @notice Mark proposal as executed. Anyone may call after voting ends.
    ///         Actual execution of off-chain/on-chain effects is the creator's
    ///         responsibility after calling this.
    function execute(bytes32 proposalId) external {
        if (block.chainid != L3_CHAIN_ID) revert DAO__WrongChain(L3_CHAIN_ID, block.chainid);

        Proposal storage p = proposals[proposalId];
        if (p.token == address(0)) revert DAO__NotFound(proposalId);
        if (block.timestamp <= p.endsAt) revert DAO__VotingNotEnded(proposalId);
        if (p.executed) revert DAO__AlreadyExecuted(proposalId);

        p.executed = true;
        bool passed = p.votesFor > p.votesAgainst;
        emit ProposalExecuted(proposalId, passed);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /// @notice Whether a proposal passed (more FOR votes than AGAINST, voting ended).
    function hasPassed(bytes32 proposalId) external view returns (bool) {
        Proposal storage p = proposals[proposalId];
        return p.token != address(0)
            && block.timestamp > p.endsAt
            && p.votesFor > p.votesAgainst;
    }

    /// @notice Snapshot of current vote tally.
    function tally(bytes32 proposalId) external view returns (uint256 forVotes, uint256 againstVotes) {
        Proposal storage p = proposals[proposalId];
        return (p.votesFor, p.votesAgainst);
    }
}
