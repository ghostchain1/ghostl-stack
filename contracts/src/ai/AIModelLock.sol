// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Governance-locked model allowlist + freeze switch with evidence hashes.
/// @dev Designed to enforce "model choice lock" and "output freeze" on-chain.
///      Integrate by wiring `AICommandCenter.setModelLock(...)` to this contract.
contract AIModelLock is Governed {
    struct ModelConfig {
        bool allowed;
        bytes32 evidenceHash;
        uint64 updatedAt;
    }

    bytes32 public immutable constitutionHash;

    mapping(bytes32 => ModelConfig) private models;

    bool public frozen;
    bytes32 public freezeEvidenceHash;
    uint64 public freezeUpdatedAt;

    event ModelConfigured(bytes32 indexed modelId, bool allowed, bytes32 evidenceHash);
    event FreezeSet(bool frozen, bytes32 evidenceHash);

    error InvalidModelId();
    error InvalidEvidenceHash();

    constructor(address governor_, address timelock_, bytes32 constitutionHash_) Governed(governor_, timelock_) {
        require(constitutionHash_ != bytes32(0), "constitution=0");
        constitutionHash = constitutionHash_;
    }

    function getModel(bytes32 modelId) external view returns (ModelConfig memory) {
        return models[modelId];
    }

    function isModelAllowed(bytes32 modelId) external view returns (bool) {
        return models[modelId].allowed;
    }

    function setModel(bytes32 modelId, bool allowed, bytes32 evidenceHash) external onlyGovernance {
        if (modelId == bytes32(0)) revert InvalidModelId();
        if (evidenceHash == bytes32(0)) revert InvalidEvidenceHash();
        models[modelId] = ModelConfig({allowed: allowed, evidenceHash: evidenceHash, updatedAt: uint64(block.timestamp)});
        emit ModelConfigured(modelId, allowed, evidenceHash);
    }

    function setFrozen(bool frozen_, bytes32 evidenceHash) external onlyGovernance {
        if (evidenceHash == bytes32(0)) revert InvalidEvidenceHash();
        frozen = frozen_;
        freezeEvidenceHash = evidenceHash;
        freezeUpdatedAt = uint64(block.timestamp);
        emit FreezeSet(frozen_, evidenceHash);
    }
}

