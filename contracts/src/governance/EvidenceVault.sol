// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Governance-locked evidence hash vault with signer metadata.
contract EvidenceVault is Governed {
    struct EvidenceRecord {
        bytes32 kind;
        bytes32 evidenceHash;
        bytes32 policyKey;
        uint32 policyVersion;
        uint256 proposalId;
        bytes32 signerSetHash;
        uint16 threshold;
        bytes32 metadataHash;
        uint64 recordedAt;
        address recorder;
    }

    bytes32 public immutable constitutionHash;

    mapping(address => bool) public submitters;
    mapping(bytes32 => EvidenceRecord) private records;
    mapping(bytes32 => bool) public recordExists;

    event SubmitterUpdated(address indexed submitter, bool allowed);
    event EvidenceRecorded(
        bytes32 indexed recordId,
        bytes32 indexed kind,
        bytes32 indexed evidenceHash,
        bytes32 policyKey,
        uint32 policyVersion,
        uint256 proposalId,
        bytes32 signerSetHash,
        uint16 threshold,
        bytes32 metadataHash,
        address recorder
    );

    error InvalidEvidence();
    error NotAuthorized();

    constructor(address governor_, address timelock_, bytes32 constitutionHash_) Governed(governor_, timelock_) {
        require(constitutionHash_ != bytes32(0), "constitution=0");
        constitutionHash = constitutionHash_;
    }

    function setSubmitter(address submitter, bool allowed) external onlyGovernance {
        submitters[submitter] = allowed;
        emit SubmitterUpdated(submitter, allowed);
    }

    function getRecord(bytes32 recordId) external view returns (EvidenceRecord memory) {
        return records[recordId];
    }

    function isEvidenceRecorded(bytes32 evidenceHash) external view returns (bool) {
        return recordExists[evidenceHash];
    }

    function recordEvidence(
        bytes32 kind,
        bytes32 evidenceHash,
        bytes32 policyKey,
        uint32 policyVersion,
        uint256 proposalId,
        bytes32 signerSetHash,
        uint16 threshold,
        bytes32 metadataHash
    ) external returns (bytes32 recordId) {
        if (kind == bytes32(0) || evidenceHash == bytes32(0)) revert InvalidEvidence();
        if (msg.sender != governor && msg.sender != timelock && !submitters[msg.sender]) revert NotAuthorized();

        recordId = keccak256(
            abi.encode(
                kind,
                evidenceHash,
                policyKey,
                policyVersion,
                proposalId,
                signerSetHash,
                threshold,
                metadataHash,
                constitutionHash
            )
        );

        EvidenceRecord storage existing = records[recordId];
        if (existing.recordedAt == 0) {
            records[recordId] = EvidenceRecord({
                kind: kind,
                evidenceHash: evidenceHash,
                policyKey: policyKey,
                policyVersion: policyVersion,
                proposalId: proposalId,
                signerSetHash: signerSetHash,
                threshold: threshold,
                metadataHash: metadataHash,
                recordedAt: uint64(block.timestamp),
                recorder: msg.sender
            });
            recordExists[evidenceHash] = true;
            emit EvidenceRecorded(
                recordId,
                kind,
                evidenceHash,
                policyKey,
                policyVersion,
                proposalId,
                signerSetHash,
                threshold,
                metadataHash,
                msg.sender
            );
        }
    }
}
