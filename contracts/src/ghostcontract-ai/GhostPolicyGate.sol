// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GhostPolicyGate
/// @notice Stores on-chain commitments to off-chain policy documents (as keccak256 hashes).
///         Any upgrade/deploy action must present a matching hash to pass the gate.
///
///         Policy classes:
///           0 = PERMISSIVE   — low-risk, devnet only
///           1 = STANDARD     — default production policy
///           2 = RESTRICTED   — high-risk operations with elevated quorum
///           3 = CONSTITUTIONAL — requires full governance ratification (max quorum)
contract GhostPolicyGate {
    // ──────────────────────────────────────────────────────────────────────
    // ROLES
    // ──────────────────────────────────────────────────────────────────────
    bytes32 public constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");
    bytes32 public constant POLICY_AUTHOR_ROLE = keccak256("POLICY_AUTHOR_ROLE");
    bytes32 public constant AUDITOR_ROLE       = keccak256("AUDITOR_ROLE");

    mapping(bytes32 => mapping(address => bool)) private _roles;

    // ──────────────────────────────────────────────────────────────────────
    // POLICY CLASS ENUM
    // ──────────────────────────────────────────────────────────────────────

    uint8 public constant POLICY_PERMISSIVE    = 0;
    uint8 public constant POLICY_STANDARD      = 1;
    uint8 public constant POLICY_RESTRICTED    = 2;
    uint8 public constant POLICY_CONSTITUTIONAL = 3;

    // ──────────────────────────────────────────────────────────────────────
    // POLICY RECORD
    // ──────────────────────────────────────────────────────────────────────

    struct Policy {
        bytes32  hash;           // keccak256 of the policy document bytes
        uint8    policyClass;
        uint8    minQuorum;      // number of approvals required
        bool     active;
        string   description;
        uint256  createdAt;
        address  author;
        uint256  version;
    }

    /// policy namespace → policy
    mapping(bytes32 => Policy) public policies;
    bytes32[] public policyNamespaces;

    // ──────────────────────────────────────────────────────────────────────
    // GATE PROOF REGISTRY
    // ──────────────────────────────────────────────────────────────────────

    /// Records that a given pipeline run presented a valid policy hash proof.
    struct GateProof {
        bytes32 pipelineId;
        bytes32 namespace;
        bytes32 presentedHash;
        uint256 provenAt;
        address prover;
    }

    mapping(bytes32 => GateProof) public gateProofs;   // pipelineId => proof

    // ──────────────────────────────────────────────────────────────────────
    // EVENTS
    // ──────────────────────────────────────────────────────────────────────

    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);
    event PolicyCommitted(bytes32 indexed namespace, bytes32 indexed hash, uint8 policyClass, uint8 minQuorum, uint256 version);
    event PolicyRevoked(bytes32 indexed namespace);
    event GatePassed(bytes32 indexed pipelineId, bytes32 indexed namespace, bytes32 hash);
    event GateFailed(bytes32 indexed pipelineId, bytes32 indexed namespace, bytes32 presented, bytes32 expected);

    // ──────────────────────────────────────────────────────────────────────
    // ERRORS
    // ──────────────────────────────────────────────────────────────────────

    error Unauthorized();
    error PolicyNotFound(bytes32 namespace);
    error PolicyInactive(bytes32 namespace);
    error PolicyHashMismatch(bytes32 expected, bytes32 presented);
    error DuplicatePipelineProof(bytes32 pipelineId);
    error InvalidPolicyClass(uint8 cls);
    error ZeroHash();

    // ──────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ──────────────────────────────────────────────────────────────────────

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(POLICY_AUTHOR_ROLE, admin);
        _grantRole(AUDITOR_ROLE, admin);
    }

    // ──────────────────────────────────────────────────────────────────────
    // ROLE MANAGEMENT
    // ──────────────────────────────────────────────────────────────────────

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Unauthorized();
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
    // POLICY MANAGEMENT
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Commit a new policy or update an existing one.
    function commitPolicy(
        bytes32 namespace,
        bytes32 hash,
        uint8   policyClass,
        uint8   minQuorum,
        string calldata description
    ) external onlyRole(POLICY_AUTHOR_ROLE) {
        if (hash == bytes32(0)) revert ZeroHash();
        if (policyClass > POLICY_CONSTITUTIONAL) revert InvalidPolicyClass(policyClass);

        Policy storage p = policies[namespace];
        if (p.createdAt == 0) {
            policyNamespaces.push(namespace);
        }

        uint256 newVersion = p.version + 1;
        policies[namespace] = Policy({
            hash:        hash,
            policyClass: policyClass,
            minQuorum:   minQuorum,
            active:      true,
            description: description,
            createdAt:   p.createdAt == 0 ? block.timestamp : p.createdAt,
            author:      msg.sender,
            version:     newVersion
        });

        emit PolicyCommitted(namespace, hash, policyClass, minQuorum, newVersion);
    }

    /// @notice Revoke a policy (makes it inactive; proofs against it will fail).
    function revokePolicy(bytes32 namespace) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (policies[namespace].createdAt == 0) revert PolicyNotFound(namespace);
        policies[namespace].active = false;
        emit PolicyRevoked(namespace);
    }

    // ──────────────────────────────────────────────────────────────────────
    // GATE CHECKS
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Verify the presented hash matches the active policy.
    ///         Records a gate proof on success.
    ///         Hard-fails on mismatch — callers must match exactly.
    function checkAndRecord(
        bytes32 pipelineId,
        bytes32 namespace,
        bytes32 presentedHash
    ) external onlyRole(AUDITOR_ROLE) returns (bool passed) {
        if (gateProofs[pipelineId].provenAt != 0) revert DuplicatePipelineProof(pipelineId);

        Policy storage p = policies[namespace];
        if (p.createdAt == 0) revert PolicyNotFound(namespace);
        if (!p.active) revert PolicyInactive(namespace);

        if (p.hash != presentedHash) {
            emit GateFailed(pipelineId, namespace, presentedHash, p.hash);
            revert PolicyHashMismatch(p.hash, presentedHash);
        }

        gateProofs[pipelineId] = GateProof({
            pipelineId:    pipelineId,
            namespace:     namespace,
            presentedHash: presentedHash,
            provenAt:      block.timestamp,
            prover:        msg.sender
        });

        emit GatePassed(pipelineId, namespace, presentedHash);
        return true;
    }

    /// @notice Pure view check — does not record proof.
    function verify(bytes32 namespace, bytes32 presentedHash) external view returns (bool) {
        Policy storage p = policies[namespace];
        if (p.createdAt == 0 || !p.active) return false;
        return p.hash == presentedHash;
    }

    // ──────────────────────────────────────────────────────────────────────
    // VIEWS
    // ──────────────────────────────────────────────────────────────────────

    function getPolicy(bytes32 namespace) external view returns (Policy memory) {
        return policies[namespace];
    }

    function getGateProof(bytes32 pipelineId) external view returns (GateProof memory) {
        return gateProofs[pipelineId];
    }

    function policyCount() external view returns (uint256) {
        return policyNamespaces.length;
    }

    /// @notice Compute the namespace key from a human-readable string.
    function namespaceKey(string calldata ns) external pure returns (bytes32) {
        return keccak256(bytes(ns));
    }
}
