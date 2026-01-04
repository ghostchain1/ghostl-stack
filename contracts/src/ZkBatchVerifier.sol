// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal stub for future ZK batch verification.
/// Stores verified roots per batchId; does not perform real proof checks.
contract ZkBatchVerifier {
    event BatchVerified(uint256 indexed batchId, bytes32 batchRoot, address prover, bool accepted);

    mapping(uint256 => bytes32) public verifiedRoot;

    /// @dev Accepts any non-empty proof for now; replace with real verifier later.
    function verifyBatch(bytes calldata proof, bytes32 batchRoot, uint256 batchId) external returns (bool) {
        require(proof.length > 0, "empty proof");
        verifiedRoot[batchId] = batchRoot;
        emit BatchVerified(batchId, batchRoot, msg.sender, true);
        return true;
    }
}
