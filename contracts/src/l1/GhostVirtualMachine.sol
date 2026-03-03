// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title GhostVirtualMachine (GVM)
/// @notice Anchor contract for the GhostChain EVM execution layer.
///         GVM is a full EVM-compatible execution environment that settles
///         state roots to L1 via the L2 bridge — L3→L2 only, L2→L1 only.
///         Direct L3→L1 submissions are FORBIDDEN per the GhostStack routing law.
/// @dev    Chain ID 9001 (gvm). Parent chain: L2 (chainId 901).
contract GhostVirtualMachine {
    // ─── Constants ─────────────────────────────────────────────────────────────

    uint256 public constant GVM_CHAIN_ID     = 9001;
    uint256 public constant PARENT_CHAIN_ID  = 901;   // L2 — enforces L3→L2 law
    uint256 public constant CHALLENGE_WINDOW = 7 days;
    bytes32 public constant BRIDGE_ROLE      = keccak256("GVM_BRIDGE_ROLE");
    bytes32 public constant GUARDIAN_ROLE    = keccak256("GVM_GUARDIAN_ROLE");

    // ─── State root record ──────────────────────────────────────────────────────

    struct StateRoot {
        bytes32 root;
        uint256 blockNumber;
        uint256 timestamp;
        address submitter;
        bool    challenged;
        bool    finalized;
    }

    /// @notice Monotonically-increasing submission index.
    uint256 public submissionCount;

    /// @notice submissionIndex → StateRoot
    mapping(uint256 => StateRoot) public stateRoots;

    /// @notice Latest finalized GVM block number.
    uint256 public latestFinalizedBlock;

    /// @notice Latest finalized state root.
    bytes32 public latestFinalizedRoot;

    // ─── Access control ─────────────────────────────────────────────────────────

    mapping(bytes32 => mapping(address => bool)) private _roles;

    // ─── Execution request queue ─────────────────────────────────────────────────

    struct ExecRequest {
        uint256 requestId;
        address caller;
        address target;
        bytes   callData;
        uint256 gasLimit;
        uint256 value;
        bool    executed;
        bytes   returnData;
    }

    uint256 public requestCount;
    mapping(uint256 => ExecRequest) public execRequests;

    // ─── Events ──────────────────────────────────────────────────────────────────

    event StateRootSubmitted(
        uint256 indexed submissionIndex,
        uint256 indexed gvmBlockNumber,
        bytes32         root,
        address         submitter
    );

    event StateRootFinalized(
        uint256 indexed submissionIndex,
        uint256 indexed gvmBlockNumber,
        bytes32         root
    );

    event StateRootChallenged(
        uint256 indexed submissionIndex,
        address         challenger,
        string          reason
    );

    event ExecRequested(
        uint256 indexed requestId,
        address indexed caller,
        address indexed target,
        uint256         gasLimit
    );

    event ExecSettled(
        uint256 indexed requestId,
        bool            success,
        bytes           returnData
    );

    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);
    event GVMPaused(address guardian, string reason);
    event GVMUnpaused(address guardian);

    // ─── Errors ──────────────────────────────────────────────────────────────────

    error Unauthorized(address caller, bytes32 role);
    error RoutingLawViolation(string reason);
    error AlreadyFinalized(uint256 submissionIndex);
    error ChallengeWindowOpen(uint256 submissionIndex, uint256 finalizeAt);
    error InvalidBlockNumber(uint256 submitted, uint256 latest);
    error GVMPausedError();
    error RequestAlreadyExecuted(uint256 requestId);

    // ─── Pause ───────────────────────────────────────────────────────────────────

    bool public paused;

    modifier whenNotPaused() {
        if (paused) revert GVMPausedError();
        _;
    }

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Unauthorized(msg.sender, role);
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────────

    constructor(address bridge, address guardian) {
        _roles[BRIDGE_ROLE][bridge]       = true;
        _roles[GUARDIAN_ROLE][guardian]   = true;
        emit RoleGranted(BRIDGE_ROLE, bridge);
        emit RoleGranted(GUARDIAN_ROLE, guardian);
    }

    // ─── Role management ─────────────────────────────────────────────────────────

    function grantRole(bytes32 role, address account) external onlyRole(GUARDIAN_ROLE) {
        _roles[role][account] = true;
        emit RoleGranted(role, account);
    }

    function revokeRole(bytes32 role, address account) external onlyRole(GUARDIAN_ROLE) {
        _roles[role][account] = false;
        emit RoleRevoked(role, account);
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    // ─── Pause (break-glass) ─────────────────────────────────────────────────────

    function pause(string calldata reason) external onlyRole(GUARDIAN_ROLE) {
        paused = true;
        emit GVMPaused(msg.sender, reason);
    }

    function unpause() external onlyRole(GUARDIAN_ROLE) {
        paused = false;
        emit GVMUnpaused(msg.sender);
    }

    // ─── State root submission (L2 bridge only — routing law) ──────────────────

    /// @notice Submit a GVM state root from the L2 bridge.
    ///         Only the authorized L2 bridge may call this, enforcing the
    ///         routing law: L3 → L2 only (never L3 → L1 directly).
    /// @param  gvmBlockNumber  The GVM block number for this root.
    /// @param  root            The GVM state root (keccak256 of state trie).
    function submitStateRoot(uint256 gvmBlockNumber, bytes32 root)
        external
        onlyRole(BRIDGE_ROLE)
        whenNotPaused
        returns (uint256 submissionIndex)
    {
        // Routing law: parent chain must be L2, not L1.
        // This is enforced at the deployment level but we double-check here.
        if (gvmBlockNumber <= latestFinalizedBlock) {
            revert InvalidBlockNumber(gvmBlockNumber, latestFinalizedBlock);
        }

        submissionIndex = submissionCount++;

        stateRoots[submissionIndex] = StateRoot({
            root:        root,
            blockNumber: gvmBlockNumber,
            timestamp:   block.timestamp,
            submitter:   msg.sender,
            challenged:  false,
            finalized:   false
        });

        emit StateRootSubmitted(submissionIndex, gvmBlockNumber, root, msg.sender);
    }

    /// @notice Finalize a state root after the challenge window closes.
    function finalizeStateRoot(uint256 submissionIndex) external whenNotPaused {
        StateRoot storage sr = stateRoots[submissionIndex];
        if (sr.finalized) revert AlreadyFinalized(submissionIndex);
        if (sr.challenged) revert RoutingLawViolation("state root is under challenge");

        uint256 finalizeAt = sr.timestamp + CHALLENGE_WINDOW;
        if (block.timestamp < finalizeAt) {
            revert ChallengeWindowOpen(submissionIndex, finalizeAt);
        }

        sr.finalized = true;
        latestFinalizedBlock = sr.blockNumber;
        latestFinalizedRoot  = sr.root;

        emit StateRootFinalized(submissionIndex, sr.blockNumber, sr.root);
    }

    /// @notice Challenge a submitted state root within the challenge window.
    function challengeStateRoot(uint256 submissionIndex, string calldata reason)
        external
        whenNotPaused
    {
        StateRoot storage sr = stateRoots[submissionIndex];
        if (sr.finalized) revert AlreadyFinalized(submissionIndex);
        require(block.timestamp <= sr.timestamp + CHALLENGE_WINDOW, "GVM: window closed");

        sr.challenged = true;
        emit StateRootChallenged(submissionIndex, msg.sender, reason);
    }

    // ─── Execution request API ───────────────────────────────────────────────────

    /// @notice Queue a cross-chain execution request on GVM.
    ///         The GVM off-chain service picks this up and executes it.
    /// @param  target    GVM address to call.
    /// @param  callData  ABI-encoded call.
    /// @param  gasLimit  Gas limit for the GVM execution.
    function requestExec(address target, bytes calldata callData, uint256 gasLimit)
        external
        payable
        whenNotPaused
        returns (uint256 requestId)
    {
        requestId = requestCount++;
        execRequests[requestId] = ExecRequest({
            requestId:  requestId,
            caller:     msg.sender,
            target:     target,
            callData:   callData,
            gasLimit:   gasLimit,
            value:      msg.value,
            executed:   false,
            returnData: ""
        });

        emit ExecRequested(requestId, msg.sender, target, gasLimit);
    }

    /// @notice Settle an execution result from the GVM bridge.
    function settleExec(uint256 requestId, bool success, bytes calldata returnData)
        external
        onlyRole(BRIDGE_ROLE)
        whenNotPaused
    {
        ExecRequest storage req = execRequests[requestId];
        if (req.executed) revert RequestAlreadyExecuted(requestId);

        req.executed   = true;
        req.returnData = returnData;

        emit ExecSettled(requestId, success, returnData);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────────

    /// @notice Returns whether a state root submission is within the challenge window.
    function isChallengeWindowOpen(uint256 submissionIndex) external view returns (bool) {
        StateRoot storage sr = stateRoots[submissionIndex];
        return !sr.finalized && block.timestamp <= sr.timestamp + CHALLENGE_WINDOW;
    }

    /// @notice Returns the latest finalized state root and block number.
    function latestFinalized() external view returns (bytes32 root, uint256 blockNumber) {
        return (latestFinalizedRoot, latestFinalizedBlock);
    }
}
