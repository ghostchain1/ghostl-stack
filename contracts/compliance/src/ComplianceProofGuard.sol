// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IComplianceProofRegistry {
    function isProofValid(bytes32 subjectHash, bytes32 statement) external view returns (bool);
}

contract ComplianceProofGuard {
    IComplianceProofRegistry public registry;

    error ProofInvalid();

    constructor(address registryAddress) {
        registry = IComplianceProofRegistry(registryAddress);
    }

    modifier requiresProof(bytes32 subjectHash, bytes32 statement) {
        bool ok = registry.isProofValid(subjectHash, statement);
        if (!ok) revert ProofInvalid();
        _;
    }
}
