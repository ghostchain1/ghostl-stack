// GhostChain Contracts v5.6.1 (privacy/GhostPrivateVoting.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";

/// @title GhostPrivateVoting
/// @notice ZK-anonymous voting for GhostChain governance proposals.
///
///         Flow:
///           1. Governance registers a proposal via `createProposal`.
///           2. Eligible voters generate a ZK proof off-chain proving:
///              - They hold a valid voting credential (nullifier from GNS identity).
///              - They vote exactly once per proposal (nullifier prevents double-vote).
///              - Their vote choice (yes/no/abstain) is committed without revealing.
///           3. Voters call `castPrivateVote(proposalId, nullifier, voteHash, proof)`.
///           4. After `VOTING_PERIOD` blocks, `tallyVotes(proposalId)` queries the on-chain
///              encrypted vote aggregator — the ZK rollup posts the plaintext tally.
///
/// @dev This is the on-chain half. The ZK circuit lives off-chain (GhostBrain zkSNARK).

interface IVoteVerifier {
    function verifyVote(
        uint256 proposalId,
        bytes32 credentialRoot,
        bytes32 nullifier,
        bytes32 voteCommitment,
        bytes calldata proof
    ) external view returns (bool);
}

contract GhostPrivateVoting is GhostBrand {

    // ─── Constants ───────────────────────────────────────────────────────────
    uint256 public constant VOTING_PERIOD       = 45_200; // ~7 days in blocks
    uint256 public constant MIN_VOTES_TO_TALLY  = 1;

    // ─── Types ───────────────────────────────────────────────────────────────
    enum ProposalState { Active, Tallied, Cancelled }

    struct Proposal {
        uint64       startBlock;
        uint64       endBlock;
        bytes32      credentialRoot;  // Merkle root of eligible voter identities
        ProposalState state;
        uint256      totalVotes;
        // Tallied results (zero until tallied by ZK rollup)
        uint256      votesYes;
        uint256      votesNo;
        uint256      votesAbstain;
    }

    // ─── Storage ─────────────────────────────────────────────────────────────
    IVoteVerifier public immutable VOTE_VERIFIER;
    address        public immutable GOVERNANCE;

    mapping(uint256 => Proposal) public proposals;
    /// proposalId → nullifier → spent
    mapping(uint256 => mapping(bytes32 => bool)) public spentNullifiers;

    uint256 public proposalCount;

    // ─── Events ──────────────────────────────────────────────────────────────
    event ProposalCreated(uint256 indexed proposalId, bytes32 credentialRoot, uint64 endBlock);
    event PrivateVoteCast(uint256 indexed proposalId, bytes32 indexed nullifier);
    event ProposalTallied(uint256 indexed proposalId, uint256 yes, uint256 no, uint256 abstain);
    event ProposalCancelled(uint256 indexed proposalId);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error NotGovernance();
    error ProposalNotActive();
    error VotingPeriodEnded();
    error VotingPeriodNotEnded();
    error NullifierAlreadySpent();
    error InvalidVoteProof();
    error AlreadyTallied();

    // ─── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyGovernance() {
        _onlyGovernance();
        _;
    }

    function _onlyGovernance() internal view {
        if (msg.sender != GOVERNANCE) revert NotGovernance();
    }

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(address verifier_, address governance_) {
        require(verifier_   != address(0), "verifier=0");
        require(governance_ != address(0), "gov=0");
        VOTE_VERIFIER = IVoteVerifier(verifier_);
        GOVERNANCE    = governance_;
    }

    // ─── Governance: proposal management ─────────────────────────────────────
    /// @notice Register a new private-voting proposal.
    /// @param credentialRoot  Merkle root of voter credentials (built off-chain by GhostBrain).
    function createProposal(bytes32 credentialRoot) external onlyGovernance returns (uint256 id) {
        id = proposalCount++;
        require(block.number <= type(uint64).max, "block overflow");
        uint64 start = uint64(block.number);
        uint64 end   = uint64(block.number + VOTING_PERIOD);
        proposals[id] = Proposal({
            startBlock:     start,
            endBlock:       end,
            credentialRoot: credentialRoot,
            state:          ProposalState.Active,
            totalVotes:     0,
            votesYes:       0,
            votesNo:        0,
            votesAbstain:   0
        });
        emit ProposalCreated(id, credentialRoot, end);
    }

    /// @notice Cancel an active proposal (governance emergency).
    function cancelProposal(uint256 proposalId) external onlyGovernance {
        Proposal storage p = proposals[proposalId];
        if (p.state != ProposalState.Active) revert ProposalNotActive();
        p.state = ProposalState.Cancelled;
        emit ProposalCancelled(proposalId);
    }

    // ─── Voter: cast private vote ─────────────────────────────────────────────
    /// @notice Cast an anonymous vote using a ZK proof.
    /// @param proposalId      Target proposal.
    /// @param nullifier       Unique spend token for this vote.
    /// @param voteCommitment  Encrypted vote choice (decrypted by ZK rollup at tally).
    /// @param proof           ZK proof bytes.
    function castPrivateVote(
        uint256      proposalId,
        bytes32      nullifier,
        bytes32      voteCommitment,
        bytes calldata proof
    ) external {
        Proposal storage p = proposals[proposalId];
        if (p.state != ProposalState.Active)    revert ProposalNotActive();
        if (block.number > p.endBlock)          revert VotingPeriodEnded();
        if (spentNullifiers[proposalId][nullifier]) revert NullifierAlreadySpent();

        bool valid = VOTE_VERIFIER.verifyVote(
            proposalId,
            p.credentialRoot,
            nullifier,
            voteCommitment,
            proof
        );
        if (!valid) revert InvalidVoteProof();

        spentNullifiers[proposalId][nullifier] = true;
        p.totalVotes++;

        emit PrivateVoteCast(proposalId, nullifier);
    }

    // ─── Governance: post-period tally ───────────────────────────────────────
    /// @notice Submit the ZK-proven vote tally after the voting period ends.
    ///         GhostBrain zkSNARK rollup computes the plaintext result and posts it here.
    function tallyVotes(
        uint256 proposalId,
        uint256 yes,
        uint256 no,
        uint256 abstain
    ) external onlyGovernance {
        Proposal storage p = proposals[proposalId];
        if (p.state != ProposalState.Active) revert ProposalNotActive();
        if (block.number <= p.endBlock)      revert VotingPeriodNotEnded();
        if (p.state == ProposalState.Tallied) revert AlreadyTallied();

        p.state       = ProposalState.Tallied;
        p.votesYes    = yes;
        p.votesNo     = no;
        p.votesAbstain= abstain;

        emit ProposalTallied(proposalId, yes, no, abstain);
    }
}
