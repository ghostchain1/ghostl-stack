// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

interface IMainnetLaunchGateView {
    function isLaunchAuthorized(bytes32 releaseId, bytes32 manifestHash) external view returns (bool);
}

/// @notice Constitutional pre-mainnet gate layered on top of MainnetLaunchGate.
/// @dev Governance must bind constitution + manifest + proposal + timelock + attestation.
contract ReleaseGate is Governed {
    struct LaunchConfig {
        bytes32 releaseId;
        bytes32 manifestHash;
        bytes32 constitutionHash;
        bytes32 releaseManifestHash;
        bytes32 proposalIdHash;
        bytes32 attestationHash;
        uint64 timelockExpiresAt;
        bool attestationRequired;
    }

    error InvalidLaunchGate(address gate);
    error InvalidHash();
    error InvalidReleaseId();
    error InvalidTimelock();

    IMainnetLaunchGateView public immutable launchGate;
    LaunchConfig public launchConfig;

    mapping(bytes32 => bool) public approvedConstitutionHashes;
    mapping(bytes32 => bool) public approvedReleaseManifestHashes;
    mapping(bytes32 => bool) public approvedProposalIdHashes;
    mapping(bytes32 => bool) public approvedAttestationHashes;

    event ConstitutionHashApproved(bytes32 indexed constitutionHash, bool approved);
    event ReleaseManifestHashApproved(bytes32 indexed releaseManifestHash, bool approved);
    event ProposalIdHashApproved(bytes32 indexed proposalIdHash, bool approved);
    event AttestationHashApproved(bytes32 indexed attestationHash, bool approved);
    event LaunchConfigUpdated(
        bytes32 indexed releaseId,
        bytes32 indexed manifestHash,
        bytes32 constitutionHash,
        bytes32 releaseManifestHash,
        bytes32 proposalIdHash,
        bytes32 attestationHash,
        uint64 timelockExpiresAt,
        bool attestationRequired
    );

    constructor(address governor_, address timelock_, address launchGate_) Governed(governor_, timelock_) {
        if (launchGate_ == address(0) || launchGate_.code.length == 0) revert InvalidLaunchGate(launchGate_);
        launchGate = IMainnetLaunchGateView(launchGate_);
    }

    function setConstitutionHash(bytes32 constitutionHash, bool approved) external onlyGovernance {
        if (constitutionHash == bytes32(0)) revert InvalidHash();
        approvedConstitutionHashes[constitutionHash] = approved;
        emit ConstitutionHashApproved(constitutionHash, approved);
    }

    function setReleaseManifestHash(bytes32 releaseManifestHash, bool approved) external onlyGovernance {
        if (releaseManifestHash == bytes32(0)) revert InvalidHash();
        approvedReleaseManifestHashes[releaseManifestHash] = approved;
        emit ReleaseManifestHashApproved(releaseManifestHash, approved);
    }

    function setProposalIdHash(bytes32 proposalIdHash, bool approved) external onlyGovernance {
        if (proposalIdHash == bytes32(0)) revert InvalidHash();
        approvedProposalIdHashes[proposalIdHash] = approved;
        emit ProposalIdHashApproved(proposalIdHash, approved);
    }

    function setAttestationHash(bytes32 attestationHash, bool approved) external onlyGovernance {
        if (attestationHash == bytes32(0)) revert InvalidHash();
        approvedAttestationHashes[attestationHash] = approved;
        emit AttestationHashApproved(attestationHash, approved);
    }

    function configureLaunch(LaunchConfig calldata next) external onlyGovernance {
        if (next.releaseId == bytes32(0)) revert InvalidReleaseId();
        if (next.manifestHash == bytes32(0)) revert InvalidHash();
        if (next.constitutionHash == bytes32(0)) revert InvalidHash();
        if (next.releaseManifestHash == bytes32(0)) revert InvalidHash();
        if (next.proposalIdHash == bytes32(0)) revert InvalidHash();
        if (next.timelockExpiresAt == 0) revert InvalidTimelock();
        if (next.attestationRequired && next.attestationHash == bytes32(0)) revert InvalidHash();

        launchConfig = next;
        emit LaunchConfigUpdated(
            next.releaseId,
            next.manifestHash,
            next.constitutionHash,
            next.releaseManifestHash,
            next.proposalIdHash,
            next.attestationHash,
            next.timelockExpiresAt,
            next.attestationRequired
        );
    }

    /// @notice True only when all constitutional + release + attestation gates are satisfied.
    function isMainnetLaunchAllowed() public view returns (bool) {
        LaunchConfig memory cfg = launchConfig;
        if (cfg.releaseId == bytes32(0) || cfg.manifestHash == bytes32(0)) return false;
        if (cfg.constitutionHash == bytes32(0) || cfg.releaseManifestHash == bytes32(0)) return false;
        if (cfg.proposalIdHash == bytes32(0) || cfg.timelockExpiresAt == 0) return false;
        if (cfg.releaseManifestHash != cfg.manifestHash) return false;
        if (!approvedConstitutionHashes[cfg.constitutionHash]) return false;
        if (!approvedReleaseManifestHashes[cfg.releaseManifestHash]) return false;
        if (!approvedProposalIdHashes[cfg.proposalIdHash]) return false;
        if (cfg.attestationRequired && !approvedAttestationHashes[cfg.attestationHash]) return false;
        if (block.timestamp < cfg.timelockExpiresAt) return false;
        return launchGate.isLaunchAuthorized(cfg.releaseId, cfg.manifestHash);
    }
}
