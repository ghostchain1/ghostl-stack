// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║          GhostChain · GhostBrain AI Contract Evolution System           ║
// ║  Self-learning · Self-evolving · Autonomous · GhostStack v2             ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/// @title  GhostBrainErrorRegistry
/// @notice Records all smart-contract errors discovered by GhostBrain's
///         autonomous scanner, together with the AI-generated fix proposals
///         and their on-chain verification status.
///
///         Life-cycle of an error:
///           OPEN → FIX_PROPOSED → FIX_APPLIED → VERIFIED
///                              → FIX_REJECTED  → (closed)
///                → WONT_FIX
///
/// @dev    Write access is restricted to SCANNER_ROLE (off-chain scanner)
///         and FIXER_ROLE (off-chain fixer service).  Both roles are granted
///         only to the GhostContractAI service account.
contract GhostBrainErrorRegistry {

    // ─── Roles ────────────────────────────────────────────────────────────

    bytes32 public constant ADMIN_ROLE   = keccak256("ADMIN_ROLE");
    bytes32 public constant SCANNER_ROLE = keccak256("SCANNER_ROLE");
    bytes32 public constant FIXER_ROLE   = keccak256("FIXER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    mapping(bytes32 => mapping(address => bool)) private _roles;

    // ─── Types ────────────────────────────────────────────────────────────

    enum ErrorSeverity { INFO, LOW, MEDIUM, HIGH, CRITICAL }

    enum ErrorStatus {
        OPEN,
        FIX_PROPOSED,
        FIX_APPLIED,
        VERIFIED,
        FIX_REJECTED,
        WONT_FIX
    }

    enum ErrorCategory {
        COMPILE_ERROR,
        PARSER_ERROR,
        IMPORT_MISSING,
        TYPE_MISMATCH,
        STACK_TOO_DEEP,
        REENTRANCY,
        ACCESS_CONTROL,
        ARITHMETIC_OVERFLOW,
        UNINITIALIZED_STORAGE,
        ROUTING_LAW_VIOLATION,
        SPDX_MISSING,
        BRANDING_MISSING,
        OTHER
    }

    struct ErrorRecord {
        uint64        id;
        ErrorCategory category;
        ErrorSeverity severity;
        ErrorStatus   status;
        /// @dev source file path (relative to repo root, max 256 bytes)
        bytes         filePath;
        /// @dev line number in source file (0 if N/A)
        uint32        line;
        /// @dev raw solc/lint error message
        bytes         errorMessage;
        /// @dev keccak256(filePath ++ errorMessage) for dedup
        bytes32       fingerprint;
        /// @dev AI-generated diff / fix description (stored off-chain at fixUri)
        bytes32       fixArtifactHash;
        bytes         fixUri;
        /// @dev confidence AI assigned to the fix (0–10 000 bps)
        uint16        fixConfidenceBps;
        address       reportedBy;
        address       fixedBy;
        uint256       reportedAt;
        uint256       fixAppliedAt;
        uint256       verifiedAt;
    }

    uint64 public errorCount;

    mapping(uint64  => ErrorRecord) public errors;
    /// @dev fingerprint → error id (for dedup — 0 means unseen)
    mapping(bytes32 => uint64) public fingerprintToId;
    /// @dev open error ids by severity for dashboard queries
    mapping(uint8   => uint64[]) private _openBySeverity;

    // ─── Events ───────────────────────────────────────────────────────────

    event ErrorReported(
        uint64  indexed id,
        bytes32 indexed fingerprint,
        ErrorSeverity   severity,
        ErrorCategory   category,
        address indexed reportedBy
    );

    event FixProposed(uint64 indexed id, bytes32 fixArtifactHash, uint16 confidenceBps, address by);
    event FixApplied(uint64 indexed id, address by);
    event ErrorVerified(uint64 indexed id, address by);
    event ErrorRejected(uint64 indexed id, address by);
    event ErrorClosedWontFix(uint64 indexed id, address by);

    // ─── Errors ───────────────────────────────────────────────────────────

    error Unauthorized();
    error AlreadyReported(uint64 existingId);
    error ErrorNotFound(uint64 id);
    error InvalidTransition(ErrorStatus current, ErrorStatus requested);
    error InvalidConfidence();

    // ─── Constructor ──────────────────────────────────────────────────────

    constructor(address admin_) {
        _grantRole(ADMIN_ROLE,   admin_);
        _grantRole(SCANNER_ROLE, admin_);
        _grantRole(FIXER_ROLE,   admin_);
        _grantRole(AUDITOR_ROLE, admin_);
    }

    // ─── Access control ───────────────────────────────────────────────────

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Unauthorized();
        _;
    }

    function grantRole(bytes32 role, address account) external onlyRole(ADMIN_ROLE) {
        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) external onlyRole(ADMIN_ROLE) {
        _roles[role][account] = false;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    // ─── Core: reporting ──────────────────────────────────────────────────

    /// @notice Report a newly discovered error.  Reverts on duplicate fingerprint.
    function reportError(
        ErrorCategory   category,
        ErrorSeverity   severity,
        bytes calldata  filePath,
        uint32          line,
        bytes calldata  errorMessage
    ) external onlyRole(SCANNER_ROLE) returns (uint64 id) {
        bytes32 fp = keccak256(abi.encode(filePath, errorMessage));
        if (fingerprintToId[fp] != 0) revert AlreadyReported(fingerprintToId[fp]);

        unchecked { id = ++errorCount; }

        errors[id] = ErrorRecord({
            id:               id,
            category:         category,
            severity:         severity,
            status:           ErrorStatus.OPEN,
            filePath:         filePath,
            line:             line,
            errorMessage:     errorMessage,
            fingerprint:      fp,
            fixArtifactHash:  bytes32(0),
            fixUri:           "",
            fixConfidenceBps: 0,
            reportedBy:       msg.sender,
            fixedBy:          address(0),
            reportedAt:       block.timestamp,
            fixAppliedAt:     0,
            verifiedAt:       0
        });

        fingerprintToId[fp] = id;
        _openBySeverity[uint8(severity)].push(id);

        emit ErrorReported(id, fp, severity, category, msg.sender);
    }

    // ─── Core: fix lifecycle ──────────────────────────────────────────────

    function proposeFix(
        uint64         id,
        bytes32        fixArtifactHash,
        bytes calldata fixUri,
        uint16         confidenceBps
    ) external onlyRole(FIXER_ROLE) {
        if (confidenceBps > 10_000) revert InvalidConfidence();
        ErrorRecord storage e = _requireExists(id);
        _requireStatus(e, ErrorStatus.OPEN);

        e.fixArtifactHash  = fixArtifactHash;
        e.fixUri           = fixUri;
        e.fixConfidenceBps = confidenceBps;
        e.status           = ErrorStatus.FIX_PROPOSED;

        emit FixProposed(id, fixArtifactHash, confidenceBps, msg.sender);
    }

    function applyFix(uint64 id) external onlyRole(FIXER_ROLE) {
        ErrorRecord storage e = _requireExists(id);
        _requireStatus(e, ErrorStatus.FIX_PROPOSED);

        e.status      = ErrorStatus.FIX_APPLIED;
        e.fixedBy     = msg.sender;
        e.fixAppliedAt = block.timestamp;

        emit FixApplied(id, msg.sender);
    }

    function verifyFix(uint64 id) external onlyRole(AUDITOR_ROLE) {
        ErrorRecord storage e = _requireExists(id);
        _requireStatus(e, ErrorStatus.FIX_APPLIED);

        e.status     = ErrorStatus.VERIFIED;
        e.verifiedAt = block.timestamp;

        emit ErrorVerified(id, msg.sender);
    }

    function rejectFix(uint64 id) external onlyRole(AUDITOR_ROLE) {
        ErrorRecord storage e = _requireExists(id);
        if (e.status != ErrorStatus.FIX_PROPOSED && e.status != ErrorStatus.FIX_APPLIED) {
            revert InvalidTransition(e.status, ErrorStatus.FIX_REJECTED);
        }
        e.status = ErrorStatus.FIX_REJECTED;
        emit ErrorRejected(id, msg.sender);
    }

    function closeWontFix(uint64 id) external onlyRole(ADMIN_ROLE) {
        ErrorRecord storage e = _requireExists(id);
        e.status = ErrorStatus.WONT_FIX;
        emit ErrorClosedWontFix(id, msg.sender);
    }

    // ─── Views ────────────────────────────────────────────────────────────

    function getError(uint64 id) external view returns (ErrorRecord memory) {
        return _requireExists(id);
    }

    function openCountBySeverity(ErrorSeverity sev) external view returns (uint256) {
        return _openBySeverity[uint8(sev)].length;
    }

    // ─── Internal ─────────────────────────────────────────────────────────

    function _requireExists(uint64 id) internal view returns (ErrorRecord storage e) {
        e = errors[id];
        if (e.id == 0) revert ErrorNotFound(id);
    }

    function _requireStatus(ErrorRecord storage e, ErrorStatus required) internal view {
        if (e.status != required) revert InvalidTransition(e.status, required);
    }

    function _grantRole(bytes32 role, address account) internal {
        _roles[role][account] = true;
    }
}
