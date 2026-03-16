// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "../common/Governed.sol";
import "./bridge/IFederationClearanceSender.sol";
import "./bridge/IFederationFinalityVerifier.sol";

/// @notice L1 council that records cross-layer proposal attestations and grants constitutional clearance.
/// @dev Bridge-agnostic: relies only on authenticated sender + source domain id delivered via adapter contracts.
contract FederationCouncil is Governed {
    struct DomainConfig {
        bool enabled;
        address adapter; // trusted receiver adapter on L1 for this domain
        address attestor; // expected source sender (L2/L3 ProposalAttestor contract address)
        bool requireGovernanceApproval;

        // Optional: if set, council will also send a clearance message down to the domain via the adapter.
        address clearanceTarget; // L2/L3 clearance receiver (e.g., XDomainFederationClearanceAdapter)
        uint32 clearanceMinGasLimit;

        // Optional: domain-specific finality verifier. If requireFinalityVerification is true, clearance requires verification.
        address finalityVerifier;
        bool requireFinalityVerification;
    }

    mapping(uint256 => DomainConfig) public domainConfigs; // sourceDomainId => config

    mapping(uint256 => mapping(bytes32 => bytes32)) public attestedHash; // domain => proposalSalt => attestationHash
    mapping(uint256 => mapping(bytes32 => bytes32)) public attestedFinalityProofHash; // domain => proposalSalt => finalityProofHash
    mapping(uint256 => mapping(bytes32 => bool)) public cleared; // domain => proposalSalt => cleared

    event DomainConfigured(
        uint256 indexed sourceDomainId,
        address indexed adapter,
        address indexed attestor,
        bool requireGovernanceApproval,
        address clearanceTarget,
        uint32 clearanceMinGasLimit,
        address finalityVerifier,
        bool requireFinalityVerification
    );
    event Attested(
        uint256 indexed sourceDomainId,
        bytes32 indexed proposalSalt,
        address indexed sourceSender,
        bytes32 attestationHash,
        bytes32 finalityProofHash
    );
    event ClearanceGranted(uint256 indexed sourceDomainId, bytes32 indexed proposalSalt, bytes32 attestationHash);

    error InvalidDomain();
    error UnauthorizedAdapter();
    error UnauthorizedAttestor();
    error NotAttested();
    error HashMismatch();
    error FinalityVerificationFailed();
    error ClearanceDeliveryFailed();

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function configureDomain(uint256 sourceDomainId, DomainConfig calldata cfg) external onlyGovernance {
        require(sourceDomainId != 0, "domainId=0");
        if (cfg.enabled) {
            require(cfg.adapter != address(0), "adapter=0");
            require(cfg.attestor != address(0), "attestor=0");
            if (cfg.requireFinalityVerification) require(cfg.finalityVerifier != address(0), "finalityVerifier=0");
        }
        domainConfigs[sourceDomainId] = cfg;
        emit DomainConfigured(
            sourceDomainId,
            cfg.adapter,
            cfg.attestor,
            cfg.requireGovernanceApproval,
            cfg.clearanceTarget,
            cfg.clearanceMinGasLimit,
            cfg.finalityVerifier,
            cfg.requireFinalityVerification
        );
    }

    /// @notice Called by the trusted bridge adapter for a given domain.
    /// @param sourceSender Authenticated sender from the source domain (enforced by the adapter).
    function recordAttestation(
        uint256 sourceDomainId,
        address sourceSender,
        bytes32 proposalSalt,
        bytes32 attestationHash_,
        bytes32 finalityProofHash
    ) external {
        DomainConfig memory cfg = domainConfigs[sourceDomainId];
        if (!cfg.enabled) revert InvalidDomain();
        if (msg.sender != cfg.adapter) revert UnauthorizedAdapter();
        if (sourceSender != cfg.attestor) revert UnauthorizedAttestor();

        attestedHash[sourceDomainId][proposalSalt] = attestationHash_;
        attestedFinalityProofHash[sourceDomainId][proposalSalt] = finalityProofHash;
        emit Attested(sourceDomainId, proposalSalt, sourceSender, attestationHash_, finalityProofHash);

        if (!cfg.requireGovernanceApproval) {
            _grantClearance(sourceDomainId, proposalSalt, attestationHash_, cfg);
        }
    }

    /// @notice Governance ratifies a previously-recorded attestation and grants clearance.
    function grantClearance(uint256 sourceDomainId, bytes32 proposalSalt, bytes32 attestationHash_) external onlyGovernance {
        DomainConfig memory cfg = domainConfigs[sourceDomainId];
        bytes32 recorded = attestedHash[sourceDomainId][proposalSalt];
        if (recorded == bytes32(0)) revert NotAttested();
        if (recorded != attestationHash_) revert HashMismatch();
        _grantClearance(sourceDomainId, proposalSalt, attestationHash_, cfg);
    }

    function isCleared(uint256 sourceDomainId, bytes32 proposalSalt, bytes32 attestationHash_) external view returns (bool) {
        if (!cleared[sourceDomainId][proposalSalt]) return false;
        return attestedHash[sourceDomainId][proposalSalt] == attestationHash_;
    }

    function _grantClearance(uint256 sourceDomainId, bytes32 proposalSalt, bytes32 attestationHash_, DomainConfig memory cfg) internal {
        if (cfg.requireFinalityVerification) {
            bytes32 finalityProofHash = attestedFinalityProofHash[sourceDomainId][proposalSalt];
            bool ok = IFederationFinalityVerifier(cfg.finalityVerifier).verifyFinality(sourceDomainId, finalityProofHash);
            if (!ok) revert FinalityVerificationFailed();
        }

        cleared[sourceDomainId][proposalSalt] = true;
        emit ClearanceGranted(sourceDomainId, proposalSalt, attestationHash_);

        if (cfg.clearanceTarget != address(0)) {
            try IFederationClearanceSender(cfg.adapter).sendClearance(
                cfg.clearanceTarget, proposalSalt, attestationHash_, cfg.clearanceMinGasLimit
            ) {} catch {
                revert ClearanceDeliveryFailed();
            }
        }
    }
}
