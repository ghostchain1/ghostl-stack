// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface for pluggable ZK settlement verifiers.
/// @dev The verifier is expected to validate the SettlementOracle EIP-712 digest for a given proof.
interface IZkSettlementVerifier {
    function verifySettlement(bytes32 digest, bytes calldata proof) external view returns (bool);
}

