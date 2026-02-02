// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "./AIOracleRegistry.sol";
import "./AIAttestationTypes.sol";
import "./IRiskScoringHook.sol";

/// @notice Append-only hub for canonical GhostAI attestations.
/// @dev Off-chain AI produces signed attestations; this contract verifies
///      signatures, nonces, expiry, and layer alignment deterministically.
contract AIAttestationHub is Governed, IRiskScoringHook {
    using AIAttestationTypes for AIAttestationTypes.AIAttestation;

    AIOracleRegistry public registry;
    uint8 public immutable layerId;

    // Per-signer nonce tracking for replay protection.
    mapping(address => uint256) public nonces;

    // Canonical attestation storage + latest index by subject and layer.
    mapping(bytes32 => AIAttestationTypes.StoredAttestation) private attestations;
    mapping(address => mapping(uint8 => bytes32)) public latestAttestationBySubjectLayer;

    event RegistryUpdated(address indexed registry);
    event AttestationSubmitted(
        bytes32 indexed attestationId,
        address indexed signer,
        address indexed subject,
        uint8 layer,
        uint16 riskScoreBps,
        uint8 confidence,
        uint256 nonce,
        uint256 expiresAt
    );
    event AttestationRevoked(
        bytes32 indexed attestationId,
        address indexed signer,
        address indexed subject,
        uint8 layer,
        address revokedBy
    );

    error AttestationExists(bytes32 attestationId);
    error LayerMismatch(uint8 expectedLayer, uint8 providedLayer);
    error NonceMismatch(uint256 expectedNonce, uint256 providedNonce);
    error AttestationExpired(uint256 expiresAt, uint256 currentTime);
    error IssuedInFuture(uint256 issuedAt, uint256 currentTime);
    error InvalidSignature();
    error SignerNotAllowed(address signer);
    error NotAuthorized();

    constructor(AIOracleRegistry registry_, uint8 layerId_, address governor_, address timelock_)
        Governed(governor_, timelock_)
    {
        require(address(registry_) != address(0), "registry=0");
        require(layerId_ >= 1 && layerId_ <= 3, "layer bounds");
        registry = registry_;
        layerId = layerId_;
        emit RegistryUpdated(address(registry_));
    }

    function setRegistry(AIOracleRegistry registry_) external onlyGovernance {
        require(address(registry_) != address(0), "registry=0");
        registry = registry_;
        emit RegistryUpdated(address(registry_));
    }

    function domainSeparator() public view returns (bytes32) {
        return AIAttestationTypes.domainSeparator(block.chainid, address(this));
    }

    function submitAttestation(AIAttestationTypes.AIAttestation calldata attestation, bytes calldata signature)
        external
        returns (bytes32 attestationId)
    {
        AIAttestationTypes.AIAttestation memory normalized = attestation.normalize();
        attestationId = normalized.attestationId;

        if (normalized.layer != layerId) {
            revert LayerMismatch(layerId, normalized.layer);
        }
        if (normalized.subject == address(0)) {
            revert NotAuthorized();
        }
        if (normalized.expiresAt <= normalized.issuedAt || normalized.expiresAt == 0) {
            revert AttestationExpired(normalized.expiresAt, block.timestamp);
        }
        if (normalized.expiresAt <= block.timestamp) {
            revert AttestationExpired(normalized.expiresAt, block.timestamp);
        }
        if (normalized.issuedAt > block.timestamp) {
            revert IssuedInFuture(normalized.issuedAt, block.timestamp);
        }

        AIAttestationTypes.StoredAttestation storage existing = attestations[attestationId];
        if (existing.submittedAt != 0) {
            revert AttestationExists(attestationId);
        }

        bytes32 digest = AIAttestationTypes.digest(domainSeparator(), normalized.structHash());
        address signer = _recoverSigner(digest, signature);

        bool allowed = registry.isSignerAllowed(signer);
        if (!allowed) {
            revert SignerNotAllowed(signer);
        }

        uint256 expectedNonce = nonces[signer] + 1;
        if (normalized.nonce != expectedNonce) {
            revert NonceMismatch(expectedNonce, normalized.nonce);
        }
        nonces[signer] = normalized.nonce;

        AIAttestationTypes.StoredAttestation storage stored = attestations[attestationId];
        stored.attestation = normalized;
        stored.signer = signer;
        stored.submittedAt = uint64(block.timestamp);
        stored.revoked = false;
        stored.revokedAt = 0;

        latestAttestationBySubjectLayer[normalized.subject][normalized.layer] = attestationId;

        emit AttestationSubmitted(
            attestationId,
            signer,
            normalized.subject,
            normalized.layer,
            normalized.riskScoreBps,
            normalized.confidence,
            normalized.nonce,
            normalized.expiresAt
        );
    }

    function revokeAttestation(bytes32 attestationId) external {
        AIAttestationTypes.StoredAttestation storage stored = attestations[attestationId];
        if (stored.submittedAt == 0) {
            revert NotAuthorized();
        }
        bool isGovernance = msg.sender == governor || (timelock != address(0) && msg.sender == timelock);
        if (!isGovernance && msg.sender != stored.signer) {
            revert NotAuthorized();
        }
        if (!stored.revoked) {
            stored.revoked = true;
            stored.revokedAt = uint64(block.timestamp);

            AIAttestationTypes.AIAttestation memory att = stored.attestation;
            if (latestAttestationBySubjectLayer[att.subject][att.layer] == attestationId) {
                latestAttestationBySubjectLayer[att.subject][att.layer] = bytes32(0);
            }

            emit AttestationRevoked(attestationId, stored.signer, att.subject, att.layer, msg.sender);
        }
    }

    function getAttestation(bytes32 attestationId)
        external
        view
        returns (AIAttestationTypes.StoredAttestation memory stored)
    {
        return attestations[attestationId];
    }

    function getLatestAttestation(address subject, uint8 layer)
        external
        view
        returns (AIAttestationTypes.StoredAttestation memory stored)
    {
        bytes32 attestationId = latestAttestationBySubjectLayer[subject][layer];
        return attestations[attestationId];
    }

    function getLatestRisk(address subject, uint8 layer)
        external
        view
        returns (uint16 riskScoreBps, uint8 confidence, bytes32 attestationId, uint256 issuedAt, uint256 expiresAt)
    {
        attestationId = latestAttestationBySubjectLayer[subject][layer];
        if (attestationId == bytes32(0)) {
            return (0, 0, bytes32(0), 0, 0);
        }
        AIAttestationTypes.StoredAttestation storage stored = attestations[attestationId];
        return (
            stored.attestation.riskScoreBps,
            stored.attestation.confidence,
            attestationId,
            stored.attestation.issuedAt,
            stored.attestation.expiresAt
        );
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address signer) {
        if (signature.length != 65) {
            revert InvalidSignature();
        }
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) {
            revert InvalidSignature();
        }
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) {
            revert InvalidSignature();
        }
    }
}
