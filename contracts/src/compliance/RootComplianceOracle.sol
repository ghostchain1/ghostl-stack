// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

interface IComplianceProofRegistry {
    function isProofValid(bytes32 proofId) external view returns (bool);
}

/// @notice L1 root compliance oracle anchored by governance-approved proofs.
contract RootComplianceOracle is Governed {
    bytes32 public latestRootHash;
    uint256 public rootEpoch;
    IComplianceProofRegistry public proofRegistry;

    event ProofRegistryUpdated(address indexed registry);
    event RootHashUpdated(uint256 indexed rootEpoch, bytes32 indexed rootHash, bytes32 proofId);

    constructor(address governor_, address timelock_, address registry) Governed(governor_, timelock_) {
        proofRegistry = IComplianceProofRegistry(registry);
        emit ProofRegistryUpdated(registry);
    }

    function setProofRegistry(address registry) external onlyGovernance {
        proofRegistry = IComplianceProofRegistry(registry);
        emit ProofRegistryUpdated(registry);
    }

    function updateRoot(bytes32 newRootHash, bytes32 proofId) external onlyGovernance returns (uint256 newEpoch) {
        require(newRootHash != bytes32(0), "root=0");
        address registry = address(proofRegistry);
        require(registry != address(0), "registry=0");
        require(IComplianceProofRegistry(registry).isProofValid(proofId), "invalid proof");
        newEpoch = rootEpoch + 1;
        rootEpoch = newEpoch;
        latestRootHash = newRootHash;
        emit RootHashUpdated(newEpoch, newRootHash, proofId);
    }
}
