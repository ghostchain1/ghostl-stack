// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IFederationFinalityVerifier.sol";

/// @notice DEV-ONLY finality verifier that accepts all proofs.
/// @dev Use for devnets where the bridge is synchronous or finality is simulated off-chain.
contract DevOnlyFinalityVerifier is IFederationFinalityVerifier {
    function verifyFinality(uint256 /*sourceDomainId*/, bytes32 /*finalityProofHash*/) external pure returns (bool) {
        return true;
    }
}

