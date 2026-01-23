// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ComplianceProofGuard.sol";

contract TreasuryComplianceGuard is ComplianceProofGuard {
    constructor(address registryAddress) ComplianceProofGuard(registryAddress) {}

    function guardedTreasury(bytes32 subjectHash, bytes32 statement) external requiresProof(subjectHash, statement) {
        // Treasury operations should call this guard before execution.
    }
}
