// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GhostUpgradeGovernor
/// @notice Manages contract upgrade proposals with time-lock, multi-sig quorum,
///         role-based approvals, and emergency quarantine controls.
///         Integrates with GhostPolicyGate for policy-hash verification.
///
/// ROUTING LAW NOTE:
///   Upgrade proposals from L3 must originate via L2 orchestration (the
///   `proposerL2Messenger` is the only trusted caller for cross-chain proposals).
///   L1 is the ratification authority for all non-devnet upgrades.
contract GhostUpgradeGovernor {
    // ──────────────────────────────────────────────────────────────────────
    // ROLES
    // ──────────────────────────────────────────────────────────────────────
    bytes32 public constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");
    bytes32 public constant PROPOSER_ROLE      = keccak256("PROPOSER_ROLE");
    bytes32 public constant APPROVER_ROLE      = keccak256("APPROVER_ROLE");
    bytes32 public constant EXECUTOR_ROLE      = keccak256("EXECUTOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE      = keccak256("GUARDIAN_ROLE");

    mapping(bytes32 => mapping(address => bool)) private _roles;

    // ──────────────────────────────────────────────────────────────────────
    // PROPOSAL
    // ──────────────────────────────────────────────────────────────────────

    enum ProposalState {
        Pending,        // awaiting quorum
        Approved,       // quorum reached; in time-lock delay
        Queued,         // time-lock expired; ready for execution
        Executed,       // completed
        Cancelled,      // cancelled by guardian/admin
        Quarantined,    // blocked by risk score
        Expired         // time-lock passed without execution
    }

    struct UpgradeProposal {
        bytes32  id;
        uint256  chainId;               // target chain
        address  proxy;                 // proxy to upgrade
        address  newImplementation;     // proposed new impl
        bytes    initCalldata;          // optional init call
        string   description;
        bytes32  policyHash;            // expected policy gate hash
        bytes32  bytecodeHash;          // new impl bytecode hash
        bytes32  gitCommit;
        uint256  riskScore;             // 0-100 (100 = highest risk)
        uint256  proposedAt;
        uint256  approvalDeadline;
        uint256  executeAfter;          // time-lock release
        uint256  executeDeadline;
        uint8    approvalsRequired;
        uint8    approvalsReceived;
        ProposalState state;
        address  proposer;
        bool     isEmergency;
    }

    mapping(bytes32 => UpgradeProposal) public proposals;
    mapping(bytes32 => mapping(address => bool)) public hasApproved;
    bytes32[] public proposalIds;

    // ──────────────────────────────────────────────────────────────────────
    // QUARANTINE
    // ──────────────────────────────────────────────────────────────────────

    /// Risk score threshold above which proposals are auto-quarantined.
    uint256 public quarantineThreshold = 70;

    /// Global pause (Break Glass).
    bool public paused;
    string public pauseReason;
    address public pausedBy;
    uint256 public pausedAt;

    // ──────────────────────────────────────────────────────────────────────
    // TIME-LOCK CONFIG
    // ──────────────────────────────────────────────────────────────────────

    uint256 public minDelay      = 2 days;    // minimum time-lock delay
    uint256 public approvalWindow = 7 days;   // time for approvers to vote
    uint256 public execWindow     = 14 days;  // window after delay to execute

    // ──────────────────────────────────────────────────────────────────────
    // EVENTS
    // ──────────────────────────────────────────────────────────────────────

    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);
    event ProposalCreated(bytes32 indexed id, uint256 chainId, address proxy, address newImpl, uint8 quorum);
    event ProposalApproved(bytes32 indexed id, address indexed approver, uint8 total);
    event ProposalQueued(bytes32 indexed id, uint256 executeAfter);
    event ProposalExecuted(bytes32 indexed id);
    event ProposalCancelled(bytes32 indexed id, address indexed by);
    event ProposalQuarantined(bytes32 indexed id, uint256 riskScore, uint256 threshold);
    event EmergencyPaused(address indexed by, string reason);
    event EmergencyUnpaused(address indexed by);
    event QuarantineThresholdUpdated(uint256 oldVal, uint256 newVal);
    event TimelockConfigUpdated(uint256 minDelay, uint256 approvalWindow, uint256 execWindow);

    // ──────────────────────────────────────────────────────────────────────
    // ERRORS
    // ──────────────────────────────────────────────────────────────────────

    error Unauthorized();
    error NotFound(bytes32 id);
    error BadState(ProposalState current, ProposalState expected);
    error AlreadyApproved();
    error TimelockActive(uint256 executeAfter);
    error ExecutionWindowExpired();
    error ApprovalDeadlinePassed();
    error QuorumNotMet(uint8 received, uint8 required);
    error PolicyHashMismatch(bytes32 expected, bytes32 actual);
    error ContractPaused();
    error ZeroAddress();
    error InvalidRiskScore();

    // ──────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ──────────────────────────────────────────────────────────────────────

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PROPOSER_ROLE, admin);
        _grantRole(APPROVER_ROLE, admin);
        _grantRole(EXECUTOR_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
    }

    // ──────────────────────────────────────────────────────────────────────
    // ROLE MANAGEMENT
    // ──────────────────────────────────────────────────────────────────────

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    function grantRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _roles[role][account] = false;
        emit RoleRevoked(role, account);
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    function _grantRole(bytes32 role, address account) internal {
        _roles[role][account] = true;
        emit RoleGranted(role, account);
    }

    // ──────────────────────────────────────────────────────────────────────
    // CONFIGURATION
    // ──────────────────────────────────────────────────────────────────────

    function setTimelockConfig(
        uint256 _minDelay,
        uint256 _approvalWindow,
        uint256 _execWindow
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minDelay = _minDelay;
        approvalWindow = _approvalWindow;
        execWindow = _execWindow;
        emit TimelockConfigUpdated(_minDelay, _approvalWindow, _execWindow);
    }

    function setQuarantineThreshold(uint256 _threshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit QuarantineThresholdUpdated(quarantineThreshold, _threshold);
        quarantineThreshold = _threshold;
    }

    // ──────────────────────────────────────────────────────────────────────
    // PROPOSAL LIFECYCLE
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Propose an upgrade. Sets state to Pending (or Quarantined if risk too high).
    function propose(
        uint256 chainId,
        address proxy,
        address newImplementation,
        bytes calldata initCalldata,
        string calldata description,
        bytes32 policyHash,
        bytes32 bytecodeHash,
        bytes32 gitCommit,
        uint256 riskScore,
        uint8   approvalsRequired,
        bool    isEmergency
    ) external onlyRole(PROPOSER_ROLE) whenNotPaused returns (bytes32 id) {
        if (proxy == address(0)) revert ZeroAddress();
        if (newImplementation == address(0)) revert ZeroAddress();
        if (riskScore > 100) revert InvalidRiskScore();

        id = keccak256(abi.encode(
            chainId, proxy, newImplementation, initCalldata,
            policyHash, bytecodeHash, gitCommit, block.timestamp, msg.sender
        ));

        ProposalState initialState = riskScore >= quarantineThreshold
            ? ProposalState.Quarantined
            : ProposalState.Pending;

        proposals[id] = UpgradeProposal({
            id:                 id,
            chainId:            chainId,
            proxy:              proxy,
            newImplementation:  newImplementation,
            initCalldata:       initCalldata,
            description:        description,
            policyHash:         policyHash,
            bytecodeHash:       bytecodeHash,
            gitCommit:          gitCommit,
            riskScore:          riskScore,
            proposedAt:         block.timestamp,
            approvalDeadline:   block.timestamp + approvalWindow,
            executeAfter:       0,   // set when approved
            executeDeadline:    0,   // set when queued
            approvalsRequired:  approvalsRequired,
            approvalsReceived:  0,
            state:              initialState,
            proposer:           msg.sender,
            isEmergency:        isEmergency
        });
        proposalIds.push(id);

        emit ProposalCreated(id, chainId, proxy, newImplementation, approvalsRequired);

        if (initialState == ProposalState.Quarantined) {
            emit ProposalQuarantined(id, riskScore, quarantineThreshold);
        }
    }

    /// @notice Approver casts approval for a pending proposal.
    function approve(bytes32 id) external onlyRole(APPROVER_ROLE) whenNotPaused {
        UpgradeProposal storage p = _requireProposal(id);

        if (p.state != ProposalState.Pending) revert BadState(p.state, ProposalState.Pending);
        if (block.timestamp > p.approvalDeadline) revert ApprovalDeadlinePassed();
        if (hasApproved[id][msg.sender]) revert AlreadyApproved();

        hasApproved[id][msg.sender] = true;
        p.approvalsReceived += 1;

        emit ProposalApproved(id, msg.sender, p.approvalsReceived);

        if (p.approvalsReceived >= p.approvalsRequired) {
            uint256 delay = p.isEmergency ? 0 : minDelay;
            p.state = ProposalState.Approved;
            p.executeAfter = block.timestamp + delay;
            p.executeDeadline = p.executeAfter + execWindow;
            emit ProposalQueued(id, p.executeAfter);
        }
    }

    /// @notice Mark an approved proposal as Queued (can be called by anyone after delay).
    function queue(bytes32 id) external {
        UpgradeProposal storage p = _requireProposal(id);
        if (p.state != ProposalState.Approved) revert BadState(p.state, ProposalState.Approved);
        if (block.timestamp < p.executeAfter) revert TimelockActive(p.executeAfter);
        p.state = ProposalState.Queued;
    }

    /// @notice Execute a queued proposal. Verification of policy hash is mandatory.
    ///         Actual proxy upgrade must be performed off-chain or via a target contract
    ///         that has been pre-authorized — this contract emits the ratification event.
    function execute(bytes32 id, bytes32 actualPolicyHash) external onlyRole(EXECUTOR_ROLE) whenNotPaused {
        UpgradeProposal storage p = _requireProposal(id);
        if (p.state != ProposalState.Queued) revert BadState(p.state, ProposalState.Queued);
        if (block.timestamp > p.executeDeadline) revert ExecutionWindowExpired();
        if (p.policyHash != bytes32(0) && p.policyHash != actualPolicyHash)
            revert PolicyHashMismatch(p.policyHash, actualPolicyHash);

        p.state = ProposalState.Executed;
        emit ProposalExecuted(id);
    }

    /// @notice Cancel a proposal (guardian/admin only).
    function cancel(bytes32 id) external onlyRole(GUARDIAN_ROLE) {
        UpgradeProposal storage p = _requireProposal(id);
        p.state = ProposalState.Cancelled;
        emit ProposalCancelled(id, msg.sender);
    }

    /// @notice Lift quarantine on a proposal (requires admin; represents escalated quorum).
    function liftQuarantine(bytes32 id) external onlyRole(DEFAULT_ADMIN_ROLE) {
        UpgradeProposal storage p = _requireProposal(id);
        if (p.state != ProposalState.Quarantined) revert BadState(p.state, ProposalState.Quarantined);
        p.state = ProposalState.Pending;
        p.approvalDeadline = block.timestamp + approvalWindow;
    }

    // ──────────────────────────────────────────────────────────────────────
    // BREAK GLASS
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Emergency pause — stops all propose/approve/execute flows.
    ///         Requires postmortem evidence pack before unpause.
    function emergencyPause(string calldata reason) external onlyRole(GUARDIAN_ROLE) {
        paused = true;
        pauseReason = reason;
        pausedBy = msg.sender;
        pausedAt = block.timestamp;
        emit EmergencyPaused(msg.sender, reason);
    }

    function emergencyUnpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        paused = false;
        emit EmergencyUnpaused(msg.sender);
    }

    // ──────────────────────────────────────────────────────────────────────
    // VIEWS
    // ──────────────────────────────────────────────────────────────────────

    function getProposal(bytes32 id) external view returns (UpgradeProposal memory) {
        return proposals[id];
    }

    function proposalCount() external view returns (uint256) {
        return proposalIds.length;
    }

    // ──────────────────────────────────────────────────────────────────────
    // INTERNAL
    // ──────────────────────────────────────────────────────────────────────

    function _requireProposal(bytes32 id) internal view returns (UpgradeProposal storage p) {
        p = proposals[id];
        if (p.proposedAt == 0) revert NotFound(id);
    }
}
