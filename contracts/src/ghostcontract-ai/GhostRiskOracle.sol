// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GhostRiskOracle
/// @notice Stores EIP-712 signed risk scores produced by the GhostContractAI service.
///         Risk scores (0-100) are used by GhostUpgradeGovernor to determine quorum
///         escalation and automatic quarantine.
///
///         EIP-712 domain: "GhostRiskOracle" v1
///         Signed struct:
///           RiskAttestation {
///             uint256 chainId;
///             address contractAddress;
///             uint256 riskScore;       // 0-100
///             uint256 timestamp;
///             bytes32 pipelineId;
///             bytes32 bytecodeHash;
///           }
contract GhostRiskOracle {
    // ──────────────────────────────────────────────────────────────────────
    // EIP-712
    // ──────────────────────────────────────────────────────────────────────

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "RiskAttestation(uint256 chainId,address contractAddress,uint256 riskScore,uint256 timestamp,bytes32 pipelineId,bytes32 bytecodeHash)"
    );

    // ──────────────────────────────────────────────────────────────────────
    // ROLES
    // ──────────────────────────────────────────────────────────────────────

    bytes32 public constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");
    bytes32 public constant ATTESTOR_ROLE      = keccak256("ATTESTOR_ROLE");
    bytes32 public constant READER_ROLE        = keccak256("READER_ROLE");

    mapping(bytes32 => mapping(address => bool)) private _roles;

    // ──────────────────────────────────────────────────────────────────────
    // RISK RECORD
    // ──────────────────────────────────────────────────────────────────────

    struct RiskAttestation {
        uint256 chainId;
        address contractAddress;
        uint256 riskScore;        // 0-100
        uint256 timestamp;
        bytes32 pipelineId;
        bytes32 bytecodeHash;
    }

    struct StoredAttestation {
        RiskAttestation data;
        address         signer;      // recovered from EIP-712 sig
        uint256         storedAt;
    }

    /// key: keccak256(abi.encode(chainId, contractAddress, pipelineId))
    mapping(bytes32 => StoredAttestation) public attestations;
    bytes32[] public attestationKeys;

    /// Latest risk score per (chainId, contractAddress) — for quick lookup.
    mapping(bytes32 => uint256) public latestRiskScore;   // key: keccak256(chainId, addr)
    mapping(bytes32 => bytes32) public latestPipelineKey; // addr key → attestation key

    // ──────────────────────────────────────────────────────────────────────
    // EVENTS
    // ──────────────────────────────────────────────────────────────────────

    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);
    event AttestorAuthorized(address indexed attestor);
    event AttestorRevoked(address indexed attestor);
    event RiskScoreSubmitted(
        bytes32 indexed key,
        uint256 indexed chainId,
        address indexed contractAddress,
        uint256 riskScore,
        bytes32 pipelineId,
        address signer
    );

    // ──────────────────────────────────────────────────────────────────────
    // ERRORS
    // ──────────────────────────────────────────────────────────────────────

    error Unauthorized();
    error InvalidSignature();
    error StaleAttestation(uint256 attestationTime, uint256 maxAge);
    error InvalidRiskScore(uint256 score);
    error DuplicateAttestation(bytes32 key);
    error AttestorNotAuthorized(address signer);

    // ──────────────────────────────────────────────────────────────────────
    // MAX ATTESTATION AGE
    // ──────────────────────────────────────────────────────────────────────

    uint256 public maxAttestationAge = 1 hours;

    // ──────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ──────────────────────────────────────────────────────────────────────

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ATTESTOR_ROLE, admin);
        _grantRole(READER_ROLE, admin);

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("GhostRiskOracle")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
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
    // AUTHORISED ATTESTORS
    // ──────────────────────────────────────────────────────────────────────

    mapping(address => bool) public authorizedAttestors;

    function authorizeAttestor(address attestor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        authorizedAttestors[attestor] = true;
        emit AttestorAuthorized(attestor);
    }

    function revokeAttestor(address attestor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        authorizedAttestors[attestor] = false;
        emit AttestorRevoked(attestor);
    }

    // ──────────────────────────────────────────────────────────────────────
    // SUBMIT ATTESTATION
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Submit an EIP-712 signed risk attestation from GhostContractAI.
    function submitAttestation(
        RiskAttestation calldata attestation,
        bytes calldata signature
    ) external onlyRole(ATTESTOR_ROLE) returns (bytes32 key) {
        if (attestation.riskScore > 100) revert InvalidRiskScore(attestation.riskScore);

        // Freshness check
        if (block.timestamp > attestation.timestamp + maxAttestationAge)
            revert StaleAttestation(attestation.timestamp, maxAttestationAge);

        // EIP-712 digest
        bytes32 structHash = keccak256(abi.encode(
            ATTESTATION_TYPEHASH,
            attestation.chainId,
            attestation.contractAddress,
            attestation.riskScore,
            attestation.timestamp,
            attestation.pipelineId,
            attestation.bytecodeHash
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        // Recover signer
        address signer = _recover(digest, signature);
        if (!authorizedAttestors[signer]) revert AttestorNotAuthorized(signer);

        key = keccak256(abi.encode(attestation.chainId, attestation.contractAddress, attestation.pipelineId));
        if (attestations[key].storedAt != 0) revert DuplicateAttestation(key);

        attestations[key] = StoredAttestation({
            data:     attestation,
            signer:   signer,
            storedAt: block.timestamp
        });
        attestationKeys.push(key);

        // Update latest
        bytes32 addrKey = keccak256(abi.encode(attestation.chainId, attestation.contractAddress));
        latestRiskScore[addrKey]   = attestation.riskScore;
        latestPipelineKey[addrKey] = key;

        emit RiskScoreSubmitted(
            key,
            attestation.chainId,
            attestation.contractAddress,
            attestation.riskScore,
            attestation.pipelineId,
            signer
        );
    }

    // ──────────────────────────────────────────────────────────────────────
    // VIEWS
    // ──────────────────────────────────────────────────────────────────────

    function getAttestation(bytes32 key) external view returns (StoredAttestation memory) {
        return attestations[key];
    }

    function getLatestRiskScore(uint256 chainId, address contractAddress)
        external
        view
        returns (uint256 score, bytes32 attestationKey)
    {
        bytes32 addrKey = keccak256(abi.encode(chainId, contractAddress));
        score = latestRiskScore[addrKey];
        attestationKey = latestPipelineKey[addrKey];
    }

    function attestationCount() external view returns (uint256) {
        return attestationKeys.length;
    }

    function computeDigest(RiskAttestation calldata attestation) external view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            ATTESTATION_TYPEHASH,
            attestation.chainId,
            attestation.contractAddress,
            attestation.riskScore,
            attestation.timestamp,
            attestation.pipelineId,
            attestation.bytecodeHash
        ));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    // ──────────────────────────────────────────────────────────────────────
    // CONFIG
    // ──────────────────────────────────────────────────────────────────────

    function setMaxAttestationAge(uint256 age) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxAttestationAge = age;
    }

    // ──────────────────────────────────────────────────────────────────────
    // INTERNAL
    // ──────────────────────────────────────────────────────────────────────

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "invalid sig length");
        bytes32 r;
        bytes32 s;
        uint8   v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0), "ecrecover failed");
        return recovered;
    }
}
