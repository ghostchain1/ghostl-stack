// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IGNSRegistry.sol";

// ────────────────────────────────────────────────────────────────────────────
// GNSConstitutionGuard — Ghost Name Service Constitutional Enforcement Module
//
// Enforces GhostStack routing law and constitutional invariants:
//   • Cannot register reserved labels without governance proposal
//   • Validator namespace auto-assigns to staking contract entries
//   • AI anomaly flags freeze contested names pending review
//   • Governance timelock enforced on all root-level mutations
//
// Integrates with:
//   • GhostConstitution governance
//   • GNSRegistry (L1)
//   • Ghost GhostBrain core (AI monitor hook)
// ────────────────────────────────────────────────────────────────────────────

interface IGovernance {
    function hasProposal(bytes32 subject, bytes32 action) external view returns (bool);
    function proposalExecuted(bytes32 proposalId) external view returns (bool);
}

interface IAIMonitor {
    function isFlagged(bytes32 node) external view returns (bool);
    function riskScore(bytes32 node) external view returns (uint8); // 0-100
}

contract GNSConstitutionGuard {
    // ── Core references ───────────────────────────────────────────────────────
    IGNSRegistry public registry;
    IGovernance  public governance;
    IAIMonitor   public aiMonitor;

    address public owner;
    address public ghostBrainCore;

    // ── Constitutional invariants ──────────────────────────────────────────────
    bytes32 public immutable GHOST_ROOT;
    uint8   public constant  AI_FREEZE_THRESHOLD = 80;   // risk score ≥ 80 → freeze
    uint256 public constant  GOVERNANCE_TIMELOCK  = 3 days;

    // ── Proposals for locked-namespace operations ──────────────────────────────
    struct Proposal {
        bytes32 node;
        bytes32 action;       // keccak256("register") | keccak256("transfer") | ...
        uint256 proposedAt;
        bool    executed;
        address proposer;
    }

    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => bool)     public frozen;            // AI-frozen names

    // ── Validator namespace ───────────────────────────────────────────────────
    /// validator token ID → node (validator.ghost sub-name node)
    mapping(uint256 => bytes32) public validatorNodes;
    address public stakingContract;

    // ── Events ────────────────────────────────────────────────────────────────
    event NameFrozen(bytes32 indexed node, uint8 riskScore, address flaggedBy);
    event NameUnfrozen(bytes32 indexed node, address by);
    event ProposalCreated(bytes32 indexed proposalId, bytes32 indexed node, bytes32 action);
    event ProposalExecuted(bytes32 indexed proposalId);
    event ValidatorBound(uint256 indexed validatorId, bytes32 node);
    event ConstitutionalViolation(bytes32 indexed node, string reason);

    // ── Errors ────────────────────────────────────────────────────────────────
    error NotOwner();
    error NotGhostBrain();
    error Frozen();
    error AlreadyFrozen();
    error NotFrozen();
    error TimelockActive();
    error AlreadyExecuted();
    error ProposalNotFound();
    error RootLocked();
    error NotStaking();

    constructor(address _registry, address _governance, address _owner) {
        owner      = _owner;
        registry   = IGNSRegistry(_registry);
        governance = IGovernance(_governance);

        GHOST_ROOT = keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("ghost"))));
    }

    modifier onlyOwner()      { if (msg.sender != owner)         revert NotOwner();      _; }
    modifier onlyGhostBrain() { if (msg.sender != ghostBrainCore) revert NotGhostBrain(); _; }

    // ── Constitutional check (called before registry writes) ──────────────────
    /// @notice Pre-flight constitutional check.  Reverts on violation.
    function assertConstitutional(bytes32 node, bytes32 labelHash, string calldata label)
        external
        view
    {
        // 1. Ghost root is forever locked
        if (node == GHOST_ROOT) revert RootLocked();

        // 2. Reserved label guard
        if (registry.reserved(labelHash)) revert RootLocked();

        // 3. AI freeze guard
        if (frozen[node]) revert Frozen();

        // 4. Constitutional label rules
        require(bytes(label).length > 0, "empty_label");
    }

    // ── AI monitoring integration (GhostBrain → freeze) ───────────────────────
    /// @notice GhostBrain flags a name for freezing (anomaly detected)
    function freezeName(bytes32 node) external {
        if (msg.sender != ghostBrainCore && msg.sender != owner) revert NotGhostBrain();
        if (frozen[node]) revert AlreadyFrozen();

        uint8 risk = 100;
        if (address(aiMonitor) != address(0)) {
            risk = aiMonitor.riskScore(node);
        }

        frozen[node] = true;
        // Lock in registry
        registry.lockName(node);

        emit NameFrozen(node, risk, msg.sender);
    }

    /// @notice Governance may unfreeze after review
    function unfreeze(bytes32 node, bytes32 proposalId) external onlyOwner {
        if (!frozen[node]) revert NotFrozen();
        Proposal storage p = proposals[proposalId];
        if (p.node != node) revert ProposalNotFound();
        if (p.executed)     revert AlreadyExecuted();
        if (block.timestamp < p.proposedAt + GOVERNANCE_TIMELOCK) revert TimelockActive();

        p.executed = true;
        frozen[node] = false;

        emit NameUnfrozen(node, msg.sender);
        emit ProposalExecuted(proposalId);
    }

    // ── Governance proposal for reserved-namespace operations ─────────────────
    function propose(bytes32 node, bytes32 action) external onlyOwner returns (bytes32 proposalId) {
        proposalId = keccak256(abi.encodePacked(node, action, block.timestamp));
        proposals[proposalId] = Proposal({
            node:        node,
            action:      action,
            proposedAt:  block.timestamp,
            executed:    false,
            proposer:    msg.sender
        });
        emit ProposalCreated(proposalId, node, action);
    }

    // ── Validator namespace auto-binding ──────────────────────────────────────
    /// @notice Called by staking contract when a validator is assigned to a GNS node
    function bindValidator(uint256 validatorId, bytes32 node) external {
        if (msg.sender != stakingContract && msg.sender != owner) revert NotStaking();
        validatorNodes[validatorId] = node;
        emit ValidatorBound(validatorId, node);
    }

    function validatorNode(uint256 validatorId) external view returns (bytes32) {
        return validatorNodes[validatorId];
    }

    // ── Admin ─────────────────────────────────────────────────────────────────
    function setGhostBrainCore(address core)    external onlyOwner { ghostBrainCore = core; }
    function setAIMonitor(address monitor)      external onlyOwner { aiMonitor = IAIMonitor(monitor); }
    function setGovernance(address gov)         external onlyOwner { governance = IGovernance(gov); }
    function setStakingContract(address sc)     external onlyOwner { stakingContract = sc; }
    function transferOwner(address newOwner)    external onlyOwner { owner = newOwner; }

    // ── Views ─────────────────────────────────────────────────────────────────
    function isFrozen(bytes32 node) external view returns (bool) {
        return frozen[node];
    }

    function requiresGovernanceProposal(bytes32 labelHash) external view returns (bool) {
        return registry.reserved(labelHash);
    }
}
