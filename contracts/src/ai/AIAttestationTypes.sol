// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GhostHash} from "../common/GhostHash.sol";

/// @notice Canonical GhostAI attestation types and hashing helpers.
/// @dev This library encodes the authoritative EIP-712 struct + domain
///      described in docs/ai/ATTESTATION_SPEC.md.
library AIAttestationTypes {
    string internal constant DOMAIN_NAME = "GhostAI";
    string internal constant DOMAIN_VERSION = "1";

    // keccak256("GhostAI")
    bytes32 internal constant DOMAIN_NAME_HASH =
        0x9993a77c31507cb26dcaca1a1832f02585be231d9d4dcbb3c804763f6ae64c84;

    // keccak256("1")
    bytes32 internal constant DOMAIN_VERSION_HASH =
        0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6;

    // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    bytes32 internal constant DOMAIN_TYPEHASH =
        0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;

    // keccak256(
    //   "AIAttestation(bytes32 attestationId,uint256 issuedAt,uint256 expiresAt,uint32 modelVersion,bytes32 modelCardHash,bytes32 inputHash,bytes32 outputHash,uint16 riskScoreBps,uint8 confidence,address subject,uint256 nonce,uint8 layer,bytes32 explanationRef)"
    // )
    bytes32 internal constant ATTESTATION_TYPEHASH =
        0xd1d84c36dfff363e325c2bd313abc2468440fe41ddf182f05e52da294beaf710;

    struct AIAttestation {
        bytes32 attestationId;
        uint256 issuedAt;
        uint256 expiresAt;
        uint32 modelVersion;
        bytes32 modelCardHash;
        bytes32 inputHash;
        bytes32 outputHash;
        uint16 riskScoreBps;
        uint8 confidence;
        address subject;
        uint256 nonce;
        uint8 layer;
        bytes32 explanationRef;
    }

    struct StoredAttestation {
        AIAttestation attestation;
        address signer;
        uint64 submittedAt;
        uint64 revokedAt;
        bool revoked;
    }

    error AttestationIdMismatch(bytes32 provided, bytes32 expected);

    /// @notice Computes the canonical attestationId from the core fields.
    /// @dev The attestationId is intentionally excluded from the core hash.
    function computeAttestationId(AIAttestation memory attestation) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                attestation.issuedAt,
                attestation.expiresAt,
                attestation.modelVersion,
                attestation.modelCardHash,
                attestation.inputHash,
                attestation.outputHash,
                attestation.riskScoreBps,
                attestation.confidence,
                attestation.subject,
                attestation.nonce,
                attestation.layer,
                attestation.explanationRef
            )
        );
    }

    /// @notice Ensures the attestationId is canonical and returns a normalized copy.
    function normalize(AIAttestation memory attestation) internal pure returns (AIAttestation memory normalized) {
        bytes32 expectedId = computeAttestationId(attestation);
        if (attestation.attestationId != bytes32(0) && attestation.attestationId != expectedId) {
            revert AttestationIdMismatch(attestation.attestationId, expectedId);
        }
        normalized = attestation;
        normalized.attestationId = expectedId;
    }

    /// @notice Computes the EIP-712 struct hash for a canonical attestation.
    function structHash(AIAttestation memory attestation) internal pure returns (bytes32) {
        AIAttestation memory normalized = normalize(attestation);
        return keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                normalized.attestationId,
                normalized.issuedAt,
                normalized.expiresAt,
                normalized.modelVersion,
                normalized.modelCardHash,
                normalized.inputHash,
                normalized.outputHash,
                normalized.riskScoreBps,
                normalized.confidence,
                normalized.subject,
                normalized.nonce,
                normalized.layer,
                normalized.explanationRef
            )
        );
    }

    /// @notice Computes the canonical domain separator for the given chain + contract.
    function domainSeparator(uint256 chainId, address verifyingContract) internal pure returns (bytes32) {
        return GhostHash.domainSeparator(DOMAIN_TYPEHASH, DOMAIN_NAME_HASH, DOMAIN_VERSION_HASH, chainId, verifyingContract);
    }

    /// @notice Computes the EIP-712 digest for signing and verification.
    function digest(bytes32 domainSeparator_, bytes32 structHash_) internal pure returns (bytes32) {
        return GhostHash.eip712Digest(domainSeparator_, structHash_);
    }
}
