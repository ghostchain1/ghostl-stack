// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

/// @notice Mirrors L1 compliance roots on L2/L3 under governance control.
contract ComplianceRootMirror is Governed {
    bytes32 public latestRootHash;
    uint256 public latestRootEpoch;
    mapping(uint256 => bytes32) public rootByEpoch;

    event RootMirrored(uint256 indexed rootEpoch, bytes32 indexed rootHash, bytes32 proofId);

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function updateRoot(bytes32 rootHash, uint256 rootEpoch, bytes32 proofId) external onlyGovernance {
        require(rootHash != bytes32(0), "root=0");
        require(rootEpoch > latestRootEpoch, "stale epoch");
        latestRootEpoch = rootEpoch;
        latestRootHash = rootHash;
        rootByEpoch[rootEpoch] = rootHash;
        emit RootMirrored(rootEpoch, rootHash, proofId);
    }
}
