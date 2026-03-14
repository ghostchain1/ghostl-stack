// GhostChain Contracts v5.6.1 (governance-ai/contracts/GovernanceCore.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// NOTE: When moved into contracts/src/, replace this inline block with:
//   import { GhostBrand } from "../GhostBrand.sol";

/**
 * @title GovernanceCore
 * @notice On-chain governance state ledger for GhostChain.
 *
 * Lifecycle:
 *   ProposalManager calls `openProposal()` to register a new proposal.
 *   VoteSystem calls `recordVotes()` after each voting window closes.
 *   Once a proposal reaches quorum and passes, the off-chain Execution Engine
 *   calls `markExecuted()` after the on-chain timelock elapses.
 *
 * Proposal states:
 *   Active   → quorum not yet reached or voting window open
 *   Passed   → quorum reached, votesFor > votesAgainst
 *   Defeated → quorum reached, votesFor <= votesAgainst (or quorum not met)
 *   Executed → Passed + execution call confirmed
 *   Cancelled → cancelled by proposer (before Active end) or by admin
 *
 * Settlement:
 *   All governance decisions finalize on GhostChain L1 (chain_id 14000101).
 *   L2 / L3 governance proposals MUST be relayed through L1 for final execution.
 *
 * Security:
 *   - Only authorised managers (ProposalManager, VoteSystem) may mutate state.
 *   - No direct token transfers; GST quorum weight is advisory (checked off-chain
 *     by VoteCoordinator and forwarded as `totalVotingPower`).
 *   - Reentrancy risk: no external calls in this contract.
 *   - Admin = GhostChainGovernor (governance-locked post-deploy).
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST.
 */
contract GovernanceCore {

    // ─── GhostBrand Constants (inlined) ──────────────────────────────────────

    uint256 internal constant L1_CHAIN_ID = 14000101;
    uint256 internal constant L2_CHAIN_ID = 901;
    uint256 internal constant L3_CHAIN_ID = 903;
    uint256 internal constant GST_UNIT    = 1e18;

    // ─── Config ───────────────────────────────────────────────────────────────

    /// @notice Minimum voting period in seconds (24 hours).
    uint64 public constant MIN_VOTING_PERIOD = 86_400;

    /// @notice Minimum quorum as a fraction of 10000 bps (e.g. 250 = 2.5%).
    uint256 public constant QUORUM_BPS = 250;

    // ─── Types ────────────────────────────────────────────────────────────────

    enum ProposalState {
        Active,
        Passed,
        Defeated,
        Executed,
        Cancelled
    }

    enum ProposalLayer {
        L1,   // chain_id 14000101
        L2,   // chain_id 901
        L3    // chain_id 903
    }

    struct Proposal {
        uint256         id;
        address         proposer;
        string          description;  // IPFS CID or short descriptor
        ProposalLayer   layer;
        uint64          createdAt;
        uint64          votingEndsAt;
        uint256         votesFor;       // GST-weighted
        uint256         votesAgainst;   // GST-weighted
        uint256         totalVotingPower; // snapshot at proposal creation
        ProposalState   state;
        bool            aiApproved;     // GhostBrain advisory flag (non-binding)
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    address public admin;

    /// @notice Addresses authorised to call state-mutating functions.
    mapping(address => bool) public managers;

    /// @notice proposal id → Proposal
    mapping(uint256 => Proposal) private _proposals;

    uint256 public proposalCount;

    // ─── Events ───────────────────────────────────────────────────────────────

    event ProposalOpened(
        uint256 indexed id,
        address indexed proposer,
        ProposalLayer   layer,
        uint64          votingEndsAt
    );
    event VotesRecorded(
        uint256 indexed id,
        uint256         votesFor,
        uint256         votesAgainst,
        ProposalState   newState
    );
    event ProposalExecuted(uint256 indexed id);
    event ProposalCancelled(uint256 indexed id, address indexed by);
    event AiAdvisorySet(uint256 indexed id, bool approved);
    event ManagerAdded(address indexed manager);
    event ManagerRemoved(address indexed manager);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotAdmin();
    error NotManager();
    error ZeroAddress();
    error InvalidProposalId(uint256 id);
    error ProposalNotActive(uint256 id, ProposalState state);
    error ProposalNotPassed(uint256 id);
    error VotingStillOpen(uint256 id);
    error VotingPeriodTooShort(uint64 given, uint64 minimum);
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

    function _onlyAdmin() internal view {
        if (msg.sender != admin) revert NotAdmin();
    }

    function _onlyManager() internal view {
        if (!managers[msg.sender]) revert NotManager();
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        admin = msg.sender;
        managers[msg.sender] = true;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function addManager(address m) external onlyAdmin {
        if (m == address(0)) revert ZeroAddress();
        managers[m] = true;
        emit ManagerAdded(m);
    }

    function removeManager(address m) external onlyAdmin {
        managers[m] = false;
        emit ManagerRemoved(m);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
    }

    // ─── Manager Writes ───────────────────────────────────────────────────────

    /**
     * @notice Register a new proposal.
     * @param proposer          Wallet that submitted the proposal.
     * @param description       Short description or IPFS CID of the full spec.
     * @param layer             Which chain layer this proposal targets.
     * @param votingPeriodSecs  Duration of the voting window (≥ MIN_VOTING_PERIOD).
     * @param totalVotingPower  GST snapshot at proposal creation (from off-chain indexer).
     */
    function openProposal(
        address       proposer,
        string calldata description,
        ProposalLayer  layer,
        uint64         votingPeriodSecs,
        uint256        totalVotingPower
    )
        external onlyManager returns (uint256 id)
    {
        if (proposer == address(0)) revert ZeroAddress();
        if (votingPeriodSecs < MIN_VOTING_PERIOD)
            revert VotingPeriodTooShort(votingPeriodSecs, MIN_VOTING_PERIOD);
        if (block.timestamp > type(uint64).max) revert TimestampOverflow();

        unchecked { id = ++proposalCount; }

        uint64 now64       = uint64(block.timestamp);
        uint64 votingEnds;
        unchecked { votingEnds = now64 + votingPeriodSecs; }
        // Overflow guard: if now64 + period < now64, it wrapped.
        if (votingEnds < now64) revert TimestampOverflow();

        _proposals[id] = Proposal({
            id:               id,
            proposer:         proposer,
            description:      description,
            layer:            layer,
            createdAt:        now64,
            votingEndsAt:     votingEnds,
            votesFor:         0,
            votesAgainst:     0,
            totalVotingPower: totalVotingPower,
            state:            ProposalState.Active,
            aiApproved:       false
        });

        emit ProposalOpened(id, proposer, layer, votingEnds);
    }

    /**
     * @notice Finalise vote tallies and transition proposal state.
     *         Called by VoteSystem after the voting window closes.
     */
    function recordVotes(
        uint256 id,
        uint256 votesFor,
        uint256 votesAgainst
    )
        external onlyManager
    {
        Proposal storage prop = _getActiveProposal(id);
        if (block.timestamp < prop.votingEndsAt) revert VotingStillOpen(id);

        prop.votesFor     = votesFor;
        prop.votesAgainst = votesAgainst;

        // Passed iff quorum met AND more for than against.
        uint256 totalVotes  = votesFor + votesAgainst;
        bool    quorumMet   = prop.totalVotingPower > 0
                              && totalVotes * 10_000 / prop.totalVotingPower >= QUORUM_BPS;
        bool    majority    = votesFor > votesAgainst;

        prop.state = (quorumMet && majority) ? ProposalState.Passed : ProposalState.Defeated;
        emit VotesRecorded(id, votesFor, votesAgainst, prop.state);
    }

    /**
     * @notice Mark a passed proposal as executed.
     *         Called by ExecutionEngine after timelock elapses and call succeeds.
     */
    function markExecuted(uint256 id) external onlyManager {
        Proposal storage prop = _proposals[id];
        _assertExists(id, prop);
        if (prop.state != ProposalState.Passed) revert ProposalNotPassed(id);
        prop.state = ProposalState.Executed;
        emit ProposalExecuted(id);
    }

    /**
     * @notice Cancel an active proposal.
     * @param id  Proposal to cancel.
     */
    function cancel(uint256 id) external {
        Proposal storage prop = _proposals[id];
        _assertExists(id, prop);
        if (prop.state != ProposalState.Active) revert ProposalNotActive(id, prop.state);
        if (msg.sender != prop.proposer && !managers[msg.sender]) revert NotManager();

        prop.state = ProposalState.Cancelled;
        emit ProposalCancelled(id, msg.sender);
    }

    /**
     * @notice Record GhostBrain advisory flag (non-binding).
     */
    function setAiAdvisory(uint256 id, bool approved) external onlyManager {
        Proposal storage prop = _proposals[id];
        _assertExists(id, prop);
        prop.aiApproved = approved;
        emit AiAdvisorySet(id, approved);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getProposal(uint256 id) external view returns (Proposal memory) {
        Proposal storage p = _proposals[id];
        _assertExists(id, p);
        return p;
    }

    function stateOf(uint256 id) external view returns (ProposalState) {
        Proposal storage p = _proposals[id];
        _assertExists(id, p);
        return p.state;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _getActiveProposal(uint256 id) internal view returns (Proposal storage p) {
        p = _proposals[id];
        _assertExists(id, p);
        if (p.state != ProposalState.Active) revert ProposalNotActive(id, p.state);
    }

    function _assertExists(uint256 id, Proposal storage p) internal view {
        // A proposal with id == 0 was never created (ids start at 1).
        if (p.id == 0 || p.id != id) revert InvalidProposalId(id);
    }
}
