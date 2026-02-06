// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice GST-native constitutional constants for governance and tooling.
/// @dev This contract is intentionally minimal: it encodes namespaced keys and hashes that can be used
///      by governance proposals and offchain enforcement gates.
contract GSTConstitution {
    // Clause identifiers (offchain-readable, onchain-addressable).
    bytes32 public constant CLAUSE_GST_NATIVE_ONLY = keccak256("ghost.constitution.gst_native_only.v1");
    bytes32 public constant CLAUSE_NO_ETH_BRANDING = keccak256("ghost.constitution.no_eth_branding.v1");

    // PolicyRegistry keys (uint256 values).
    bytes32 public constant POLICY_GST_NATIVE_ONLY = keccak256("ghost.policy.native.gst_only");
    bytes32 public constant POLICY_NATIVE_TOKEN_DECIMALS = keccak256("ghost.policy.native.token.decimals");
    bytes32 public constant POLICY_NATIVE_TOKEN_SYMBOL_HASH = keccak256("ghost.policy.native.token.symbol.hash");
    bytes32 public constant POLICY_NATIVE_TOKEN_NAME_HASH = keccak256("ghost.policy.native.token.name.hash");
}
