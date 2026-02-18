// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Governance-owned registry of reproducible evidence roots used by AI consensus and upgrade gates.
contract ConsensusEvidenceRootStore is Governed {
    struct EvidenceRoot {
        bytes32 root;
        uint32 version;
        uint64 recordedAt;
        uint64 validFrom;
        uint64 validUntil;
        bytes32 metadataHash;
        address recorder;
    }

    mapping(bytes32 => EvidenceRoot) public latestRootByKind;
    mapping(bytes32 => mapping(bytes32 => bool)) public knownRootByKind;

    event EvidenceRootRecorded(
        bytes32 indexed kind,
        bytes32 indexed root,
        uint32 version,
        uint64 validFrom,
        uint64 validUntil,
        bytes32 metadataHash,
        address recorder
    );

    error InvalidKind();
    error InvalidRoot();
    error InvalidValidityRange();

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function recordEvidenceRoot(bytes32 kind, bytes32 root, uint64 validFrom, uint64 validUntil, bytes32 metadataHash)
        external
        onlyGovernance
        returns (uint32 version)
    {
        if (kind == bytes32(0)) revert InvalidKind();
        if (root == bytes32(0)) revert InvalidRoot();

        uint64 startsAt = validFrom == 0 ? uint64(block.timestamp) : validFrom;
        if (validUntil != 0 && validUntil <= startsAt) revert InvalidValidityRange();

        EvidenceRoot storage current = latestRootByKind[kind];
        version = current.version + 1;

        latestRootByKind[kind] = EvidenceRoot({
            root: root,
            version: version,
            recordedAt: uint64(block.timestamp),
            validFrom: startsAt,
            validUntil: validUntil,
            metadataHash: metadataHash,
            recorder: msg.sender
        });
        knownRootByKind[kind][root] = true;

        emit EvidenceRootRecorded(kind, root, version, startsAt, validUntil, metadataHash, msg.sender);
    }

    function isRootActive(bytes32 kind, bytes32 root) external view returns (bool) {
        EvidenceRoot memory evidence = latestRootByKind[kind];
        if (evidence.root != root) return false;
        if (block.timestamp < evidence.validFrom) return false;
        if (evidence.validUntil != 0 && block.timestamp > evidence.validUntil) return false;
        return true;
    }

    function isKnownRoot(bytes32 kind, bytes32 root) external view returns (bool) {
        return knownRootByKind[kind][root];
    }
}
