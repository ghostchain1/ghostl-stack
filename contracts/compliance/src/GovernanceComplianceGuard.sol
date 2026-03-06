// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./ComplianceProofGuard.sol";

contract GovernanceComplianceGuard is ComplianceProofGuard {
    constructor(address registryAddress) ComplianceProofGuard(registryAddress) {}

    function guardedGovernance(bytes32 subjectHash, bytes32 statement) external requiresProof(subjectHash, statement) {
        // Governance operations should call this guard before execution.
    }
}
