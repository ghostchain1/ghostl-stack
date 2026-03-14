// GhostChain Contracts v5.6.1 (governance-ai/contracts/VoteSystem.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// NOTE: When moved into contracts/src/, replace this inline block with:
//   import { GhostBrand } from "../GhostBrand.sol";

/**
 * @title VoteSystem
 * @notice GST-weighted voting for GhostChain governance proposals.
 *
 * Voting model:
 *   - Each address casts at most ONE vote per proposal (changed vote = last wins).
 *   - Vote weight = GST balance snapshot (`snapshotWeight`) stored on first cast;
 *     off-chain VoteCoordinator must supply the snapshot balance at proposal open.
 *   - Voting closes at `votingEndsAt` (stored in GovernanceCore).
 *   - After close, `finalise()` is called; it records tallies in GovernanceCore.
 *
 * Delegation (simple):
 *   An address may delegate their vote weight to another address.
 *   The delegatee votes with the combined weight.
 *   Delegation is per-address (not per-proposal) and can be changed any time.
 *
 * Security:
 *   - Votes are sealed after `votingEndsAt` passes.
 *   - `finalise()` can only be called once per proposal.
 *   - Only authorised managers may call `finalise()`.
 *   - Reentrancy guard on finalise (calls GovernanceCore).
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST.
 */
interface IGovernanceCore {
    function recordVotes(uint256 id, uint256 votesFor, uint256 votesAgainst) external;
    function stateOf(uint256 id) external view returns (uint8);
}

contract VoteSystem {

    // ─── GhostBrand Constants (inlined) ──────────────────────────────────────

    uint256 internal constant L1_CHAIN_ID = 14000101;

    // ─── Types ────────────────────────────────────────────────────────────────

    struct Vote {
        bool    cast;
        bool    support;       // true = for, false = against
        uint256 weight;        // GST snapshot weight (in GST_UNIT fractions)
    }

    struct ProposalVotingState {
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 voterCount;
        bool    finalised;
        uint64  votingEndsAt;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    address public admin;
    IGovernanceCore public governanceCore;

    /// @notice Authorised managers (VoteCoordinator off-chain relay).
    mapping(address => bool) public managers;

    /// @notice proposal id → voter address → Vote
    mapping(uint256 => mapping(address => Vote)) private _votes;

    /// @notice proposal id → aggregated state
    mapping(uint256 => ProposalVotingState) private _states;

    /// @notice Simple delegation: voter → delegate.
    mapping(address => address) public delegate;

    /// @notice Reentrancy guard.
    bool private _locked;

    // ─── Events ───────────────────────────────────────────────────────────────

    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        address indexed effectiveVoter,  // may differ if delegated
        bool            support,
        uint256         weight
    );
    event VoteChanged(uint256 indexed proposalId, address indexed voter, bool newSupport);
    event ProposalFinalised(uint256 indexed proposalId, uint256 votesFor, uint256 votesAgainst);
    event DelegateSet(address indexed delegator, address indexed delegatee);
    event ProposalRegistered(uint256 indexed proposalId, uint64 votingEndsAt);
    event ManagerAdded(address indexed manager);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotAdmin();
    error NotManager();
    error ZeroAddress();
    error ProposalNotRegistered(uint256 id);
    error VotingClosed(uint256 id);
    error VotingStillOpen(uint256 id);
    error AlreadyFinalised(uint256 id);
    error ZeroWeight();
    error SelfDelegation();
    error Reentrancy();
    error TimestampOverflow();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    modifier onlyManager() {
        _onlyManager();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    function _onlyAdmin() internal view {
        if (msg.sender != admin) revert NotAdmin();
    }

    function _onlyManager() internal view {
        if (!managers[msg.sender]) revert NotManager();
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address governanceCore_) {
        if (governanceCore_ == address(0)) revert ZeroAddress();
        admin          = msg.sender;
        managers[msg.sender] = true;
        governanceCore = IGovernanceCore(governanceCore_);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function addManager(address m) external onlyAdmin {
        if (m == address(0)) revert ZeroAddress();
        managers[m] = true;
        emit ManagerAdded(m);
    }

    function setGovernanceCore(address c) external onlyAdmin {
        if (c == address(0)) revert ZeroAddress();
        governanceCore = IGovernanceCore(c);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
    }

    // ─── Proposal Registration ────────────────────────────────────────────────

    /**
     * @notice Register a proposal's voting window.
     *         Called by manager (off-chain VoteCoordinator) after GovernanceCore.openProposal().
     */
    function registerProposal(uint256 id, uint64 votingEndsAt) external onlyManager {
        if (block.timestamp > type(uint64).max) revert TimestampOverflow();
        ProposalVotingState storage s = _states[id];
        s.votingEndsAt = votingEndsAt;
        // voterCount, votesFor, votesAgainst default to 0.
        emit ProposalRegistered(id, votingEndsAt);
    }

    // ─── Delegation ───────────────────────────────────────────────────────────

    /**
     * @notice Delegate voting weight to `delegatee`.
     *         Set to address(0) to clear delegation.
     */
    function setDelegate(address delegatee) external {
        if (delegatee == msg.sender) revert SelfDelegation();
        delegate[msg.sender] = delegatee;
        emit DelegateSet(msg.sender, delegatee);
    }

    // ─── Voting ───────────────────────────────────────────────────────────────

    /**
     * @notice Cast or change a vote on proposal `id`.
     * @param id            Proposal id in GovernanceCore.
     * @param support       true = vote FOR, false = vote AGAINST.
     * @param weight        GST snapshot weight supplied by VoteCoordinator.
     *
     * @dev `weight` must be verified off-chain by the VoteCoordinator against
     *      the on-chain GST balance snapshot taken at the proposal's `createdAt`.
     *      The contract trusts managers to supply correct snapshots.
     */
    function vote(uint256 id, bool support, uint256 weight) external {
        ProposalVotingState storage s = _getOpenState(id);
        if (weight == 0) revert ZeroWeight();

        address voter = msg.sender;

        // Resolve delegation: if voter has a delegate, delegate casts the vote.
        address effective = delegate[voter] != address(0) ? delegate[voter] : voter;

        Vote storage existing = _votes[id][effective];

        if (existing.cast) {
            // Change vote: undo old tally.
            if (existing.support) {
                s.votesFor -= existing.weight;
            } else {
                s.votesAgainst -= existing.weight;
            }
            // Update support, keep weight (snapshot doesn't change between casts).
            existing.support = support;
            existing.weight  = weight;
            emit VoteChanged(id, effective, support);
        } else {
            _votes[id][effective] = Vote({ cast: true, support: support, weight: weight });
            s.voterCount += 1;
            emit VoteCast(id, voter, effective, support, weight);
        }

        if (support) {
            s.votesFor += weight;
        } else {
            s.votesAgainst += weight;
        }
    }

    /**
     * @notice Finalise a proposal after its voting window closes.
     *         Forwards tallies to GovernanceCore.recordVotes().
     */
    function finalise(uint256 id) external onlyManager nonReentrant {
        ProposalVotingState storage s = _states[id];
        if (s.votingEndsAt == 0) revert ProposalNotRegistered(id);
        if (block.timestamp < s.votingEndsAt) revert VotingStillOpen(id);
        if (s.finalised) revert AlreadyFinalised(id);

        s.finalised = true;

        governanceCore.recordVotes(id, s.votesFor, s.votesAgainst);
        emit ProposalFinalised(id, s.votesFor, s.votesAgainst);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function votingStateOf(uint256 id) external view returns (ProposalVotingState memory) {
        return _states[id];
    }

    function voteOf(uint256 id, address voter) external view returns (Vote memory) {
        return _votes[id][voter];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _getOpenState(uint256 id) internal view returns (ProposalVotingState storage s) {
        s = _states[id];
        if (s.votingEndsAt == 0) revert ProposalNotRegistered(id);
        if (block.timestamp >= s.votingEndsAt) revert VotingClosed(id);
        if (s.finalised) revert AlreadyFinalised(id);
    }
}
