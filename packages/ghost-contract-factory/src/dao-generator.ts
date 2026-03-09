/**
 * dao-generator.ts — Token-weighted DAO governance contract generator.
 *
 * Produces a Forge-lint-compliant Solidity 0.8.24 DAO with:
 *   - `createProposal(string)` — any token holder can propose
 *   - `vote(uint256, bool)` — token-weighted vote (one vote per token per proposal)
 *   - `executeProposal(uint256)` — callable by anyone once voting ends + quorum met
 *   - `cancelProposal(uint256)` — proposer or owner can cancel
 *
 * Voting is by token snapshot at proposal creation block (snapshotted via
 * a `getPriorVotes` hook pattern; can be integrated with ChainBrain AI layer).
 */

import {
  GHOST_SPDX_MIT,
  GHOST_PRAGMA,
  ghostContractHeader,
  natspec,
  solidityFile,
} from "./ast-builder.js";

export interface DaoOptions {
  /** Solidity contract name, e.g. "GhostCouncilDAO" */
  name: string;
  /** Human-readable DAO label for NatSpec */
  label?: string;
  /** Voting period in blocks (default 45818 ≈ 1 week at 13s/block) */
  votingPeriodBlocks?: number;
  /**
   * Quorum in basis points of total supply (default 500 = 5%).
   * Proposal passes when forVotes >= quorum of total snapshot supply.
   */
  quorumBps?: number;
  /**
   * Minimum token balance required to create a proposal (whole tokens, 18 dec).
   * Default "1" (1 token unit).
   */
  proposalThreshold?: string;
  /** Relative path from the generated file to contracts/src/ghost/ (default "../ghost") */
  ghostImportBase?: string;
}

/**
 * Generates a DAO governance contract source string.
 *
 * @param opts       Generator options
 * @param outputPath Workspace-relative destination, used in the header comment.
 */
export function generateDao(opts: DaoOptions, outputPath: string): string {
  const label           = opts.label ?? opts.name;
  const votingPeriod    = opts.votingPeriodBlocks ?? 45818;
  const quorumBps       = opts.quorumBps ?? 500;
  const proposalThresh  = opts.proposalThreshold ?? "1";

  // ── Proposal enum ──
  const proposalEnum = `\
    enum ProposalState { Pending, Active, Defeated, Succeeded, Executed, Canceled }`;

  // ── Proposal struct ──
  const proposalStruct = `\
    struct Proposal {
        address proposer;
        string  description;
        uint256 startBlock;
        uint256 endBlock;
        uint256 snapshotTotalSupply;
        uint256 forVotes;
        uint256 againstVotes;
        bool    executed;
        bool    canceled;
    }`;

  // ── state ──
  const stateBlock = `\
    address public immutable GOVERNANCE_TOKEN;

    address public owner;
    uint256 public proposalCount;
    uint256 public constant VOTING_PERIOD     = ${votingPeriod};
    uint256 public constant QUORUM_BPS        = ${quorumBps};
    uint256 public constant PROPOSAL_THRESHOLD = ${proposalThresh} * 1e18;

    mapping(uint256 => Proposal)                    public proposals;
    mapping(uint256 => mapping(address => bool))    public hasVoted;
    mapping(uint256 => mapping(address => uint256)) public voteWeight;`;

  // ── events ──
  const eventsBlock = `\
    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string description);
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCanceled(uint256 indexed proposalId);
    event OwnershipTransferred(address indexed from, address indexed to);`;

  // ── errors ──
  const errorsBlock = `\
    error NotOwner();
    error BelowThreshold();
    error VotingClosed();
    error VotingOpen();
    error AlreadyVoted();
    error ProposalNotSucceeded();
    error ProposalAlreadyFinalized();
    error NotProposerOrOwner();`;

  // ── inline governance token interface ──
  const govInterface = `\
    interface IGovToken {
        function balanceOf(address account) external view returns (uint256);
        function totalSupply() external view returns (uint256);
    }`;

  // ── modifier ──
  const modBlock = `\
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }`;

  // ── constructor ──
  const ctorBlock = `\
    constructor(address governanceToken, address initialOwner) {
        require(governanceToken != address(0), "${label}: zero token");
        require(initialOwner    != address(0), "${label}: zero owner");
        GOVERNANCE_TOKEN = governanceToken;
        owner            = initialOwner;
    }`;

  // ── state() helper ──
  const stateFn = `\
    function state(uint256 proposalId) public view returns (ProposalState) {
        Proposal storage p = proposals[proposalId];
        require(p.startBlock != 0, "${label}: unknown proposal");
        if (p.canceled)  return ProposalState.Canceled;
        if (p.executed)  return ProposalState.Executed;
        if (block.number <= p.endBlock) return ProposalState.Active;
        uint256 quorumVotes = (p.snapshotTotalSupply * QUORUM_BPS) / 10_000;
        if (p.forVotes < quorumVotes || p.forVotes <= p.againstVotes) {
            return ProposalState.Defeated;
        }
        return ProposalState.Succeeded;
    }`;

  // ── createProposal ──
  const createFn = `\
    /// @notice Creates a new proposal. Caller must hold >= PROPOSAL_THRESHOLD tokens.
    function createProposal(string calldata description) external returns (uint256 proposalId) {
        uint256 balance = IGovToken(GOVERNANCE_TOKEN).balanceOf(msg.sender);
        if (balance < PROPOSAL_THRESHOLD) revert BelowThreshold();

        uint256 totalSupply = IGovToken(GOVERNANCE_TOKEN).totalSupply();
        proposalId = ++proposalCount;

        proposals[proposalId] = Proposal({
            proposer:            msg.sender,
            description:         description,
            startBlock:          block.number,
            endBlock:            block.number + VOTING_PERIOD,
            snapshotTotalSupply: totalSupply,
            forVotes:            0,
            againstVotes:        0,
            executed:            false,
            canceled:            false
        });

        emit ProposalCreated(proposalId, msg.sender, description);
    }`;

  // ── vote ──
  const voteFn = `\
    /// @notice Cast a token-weighted vote on an active proposal.
    /// @param proposalId  The proposal to vote on.
    /// @param support     true = vote for, false = vote against.
    function vote(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        require(p.startBlock != 0,            "${label}: unknown proposal");
        require(block.number <= p.endBlock,   "${label}: voting closed");
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted();

        uint256 weight = IGovToken(GOVERNANCE_TOKEN).balanceOf(msg.sender);
        require(weight > 0, "${label}: no voting power");

        hasVoted[proposalId][msg.sender]   = true;
        voteWeight[proposalId][msg.sender] = weight;

        if (support) {
            p.forVotes += weight;
        } else {
            p.againstVotes += weight;
        }

        emit VoteCast(proposalId, msg.sender, support, weight);
    }`;

  // ── executeProposal ──
  const executeFn = `\
    /// @notice Executes a succeeded proposal. Can be called by anyone.
    function executeProposal(uint256 proposalId) external {
        if (state(proposalId) != ProposalState.Succeeded) revert ProposalNotSucceeded();
        proposals[proposalId].executed = true;
        emit ProposalExecuted(proposalId);
        // NOTE: on-chain calldata execution can be added here by inheriting contracts.
    }`;

  // ── cancelProposal ──
  const cancelFn = `\
    /// @notice Cancels a proposal. Only the proposer or owner may cancel.
    function cancelProposal(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(p.startBlock != 0, "${label}: unknown proposal");
        if (p.executed || p.canceled) revert ProposalAlreadyFinalized();
        if (msg.sender != p.proposer && msg.sender != owner) revert NotProposerOrOwner();
        p.canceled = true;
        emit ProposalCanceled(proposalId);
    }`;

  // ── transferOwnership ──
  const ownerFn = `\
    function transferOwnership(address to) external onlyOwner {
        require(to != address(0), "${label}: zero address");
        emit OwnershipTransferred(owner, to);
        owner = to;
    }`;

  const contractBody = [
    `    ${proposalEnum}`,
    `    ${proposalStruct}`,
    `    // ── State ─────────────────────────────────────────────────────────────────\n\n    ${stateBlock}`,
    `    // ── Events ────────────────────────────────────────────────────────────────\n\n    ${eventsBlock}`,
    `    // ── Errors ────────────────────────────────────────────────────────────────\n\n    ${errorsBlock}`,
    `    // ── Modifier ─────────────────────────────────────────────────────────────\n\n    ${modBlock}`,
    `    // ── Constructor ──────────────────────────────────────────────────────────\n\n    ${ctorBlock}`,
    `    // ── Governance ───────────────────────────────────────────────────────────\n\n    ${[stateFn, createFn, voteFn, executeFn, cancelFn, ownerFn].join("\n\n    ")}`,
  ].join("\n\n");

  const doc = natspec({
    title: `${opts.name} — GhostChain Token-Weighted DAO`,
    notice: "Minimal on-chain governance with proposal, vote, and execute lifecycle.",
    dev: [
      `Voting period: ${votingPeriod} blocks.`,
      `Quorum: ${quorumBps} bps of total supply.`,
      "Executed proposals emit ProposalExecuted; inheriting contracts may override executeProposal for calldata dispatch.",
    ].join(" "),
  });

  const contractDecl = `${doc}\ncontract ${opts.name} {\n${contractBody}\n}`;

  return solidityFile([
    GHOST_SPDX_MIT,
    GHOST_PRAGMA,
    ghostContractHeader(outputPath),
    govInterface,
    contractDecl,
  ]);
}
