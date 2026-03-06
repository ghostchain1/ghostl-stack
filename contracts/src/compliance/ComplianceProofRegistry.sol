// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Minimal compliance proof registry for governance-approved proofs.
contract ComplianceProofRegistry is Governed {
    mapping(bytes32 => bool) public proofValid;

    event ProofStatusUpdated(bytes32 indexed proofId, bool valid);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function setProofStatus(bytes32 proofId, bool valid) external onlyGovernance {
        proofValid[proofId] = valid;
        emit ProofStatusUpdated(proofId, valid);
    }

    function isProofValid(bytes32 proofId) external view returns (bool) {
        return proofValid[proofId];
    }
}
