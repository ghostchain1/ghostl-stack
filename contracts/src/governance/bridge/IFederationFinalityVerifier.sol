// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Domain-specific finality verifier.
/// @dev If used, the verifier is expected to be anchored on GhostChain L1 and return true iff the domain's finality proof
///      hash corresponds to a finalized state for that domain.
interface IFederationFinalityVerifier {
    function verifyFinality(uint256 sourceDomainId, bytes32 finalityProofHash) external view returns (bool);
}

