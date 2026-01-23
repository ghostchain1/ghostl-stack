// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ComplianceProofGuard.sol";

contract BridgeComplianceGuard is ComplianceProofGuard {
    constructor(address registryAddress) ComplianceProofGuard(registryAddress) {}

    function guardedBridge(bytes32 subjectHash, bytes32 statement) external requiresProof(subjectHash, statement) {
        // Bridge actions should call this guard before execution.
    }
}
