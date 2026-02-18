// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice GST-native constitutional constants for governance and tooling.
/// @dev This contract is intentionally minimal: it encodes namespaced keys and hashes that can be used
///      by governance proposals and offchain enforcement gates.
contract GSTConstitution {
    // Clause identifiers (offchain-readable, onchain-addressable).
    bytes32 public constant CLAUSE_GST_NATIVE_ONLY = keccak256("ghost.constitution.gst_native_only.v1");
    bytes32 public constant CLAUSE_GST_ONLY_ALL_LAYERS = keccak256("ghost.constitution.gst_only_l1_l2_l3.v1");
    bytes32 public constant CLAUSE_NO_LEGACY_BRANDING = keccak256("ghost.constitution.no_legacy_branding.v1");
    bytes32 public constant CLAUSE_NO_LEGACY_BRANDING_SURFACES = keccak256("ghost.constitution.no_legacy_eth_surface.v1");
    bytes32 public constant CLAUSE_REQUIRE_GST_LEAKAGE_GATE =
        keccak256("ghost.constitution.require_gst_leakage_gate.v1");
    bytes32 public constant CLAUSE_REQUIRE_GST_FOUNDRY_INVARIANTS =
        keccak256("ghost.constitution.require_gst_foundry_invariants.v1");
    bytes32 public constant CLAUSE_NATIVE_METADATA_GOVERNANCE_ONLY =
        keccak256("ghost.constitution.native_metadata_governance_only.v1");

    // PolicyRegistry keys (uint256 values).
    bytes32 public constant POLICY_GST_NATIVE_ONLY = keccak256("ghost.policy.native.gst_only");
    bytes32 public constant POLICY_GST_ONLY_L1_L2_L3 = keccak256("ghost.policy.native.gst_l1_l2_l3_only");
    bytes32 public constant POLICY_NO_LEGACY_BRANDING_SURFACES =
        keccak256("ghost.policy.branding.no_legacy_eth_surface");
    bytes32 public constant POLICY_REQUIRE_GST_LEAKAGE_GATE =
        keccak256("ghost.policy.release.gst_leakage_gate_required");
    bytes32 public constant POLICY_REQUIRE_GST_INVARIANTS =
        keccak256("ghost.policy.release.gst_invariant_test_required");
    bytes32 public constant POLICY_NATIVE_METADATA_GOVERNANCE_ONLY =
        keccak256("ghost.policy.native.metadata_governance_only");
    bytes32 public constant POLICY_NATIVE_TOKEN_DECIMALS = keccak256("ghost.policy.native.token.decimals");
    bytes32 public constant POLICY_NATIVE_TOKEN_SYMBOL_HASH = keccak256("ghost.policy.native.token.symbol.hash");
    bytes32 public constant POLICY_NATIVE_TOKEN_NAME_HASH = keccak256("ghost.policy.native.token.name.hash");
}
