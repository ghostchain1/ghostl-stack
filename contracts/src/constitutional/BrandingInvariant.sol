// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";

/// @title BrandingInvariant
/// @notice On-chain enforcement of GhostChain's non-negotiable brand constants:
///         Name = "Ghost", Symbol = "GST", Decimals = 18.
///
/// @dev This contract provides guard functions that revert if a proposed token
///      metadata mutation violates brand law. It is intended to be inherited by
///      token contracts, governance executors, and upgrade guards.
///
///      Brand Law (non-negotiable):
///        - Native token name MUST be "Ghost"
///        - Native token symbol MUST be "GST"
///        - Native token decimals MUST be 18
///        - No "eth", "ETH", "ether", "Ethereum" references in canonical token metadata
///
///      References: contracts/src/GhostBrand.sol, scripts/brand-audit.sh, docs/brand/spec.json
abstract contract BrandingInvariant is GhostBrand {
    // ─── Errors ───────────────────────────────────────────────────────────────

    /// @notice Caller attempted to set a non-canonical token name
    error BrandingInvariant_InvalidName(string provided, string required);

    /// @notice Caller attempted to set a non-canonical token symbol
    error BrandingInvariant_InvalidSymbol(string provided, string required);

    /// @notice Caller attempted to set a non-canonical decimals value
    error BrandingInvariant_InvalidDecimals(uint8 provided, uint8 required);

    /// @notice Caller attempted to set a forbidden legacy (ETH/Ether) reference
    error BrandingInvariant_LegacyBrandingForbidden(string field);

    // ─── Events ───────────────────────────────────────────────────────────────

    event BrandingInvariantEnforced(address indexed caller, string field);

    // ─── Derived constants ────────────────────────────────────────────────────

    /// @dev keccak256 hashes for O(1) string comparison
    bytes32 private constant _GHOST_NAME_HASH   = keccak256(bytes("Ghost"));
    bytes32 private constant _GHOST_SYMBOL_HASH = keccak256(bytes("GST"));

    /// @dev Forbidden legacy brand strings (lowercase for comparison)
    bytes32 private constant _ETH_HASH      = keccak256(bytes("eth"));
    bytes32 private constant _ETHER_HASH    = keccak256(bytes("ether"));
    bytes32 private constant _ETHEREUM_HASH = keccak256(bytes("ethereum"));

    // ─── Guard functions ──────────────────────────────────────────────────────

    /// @notice Asserts that a proposed token name matches the canonical "Ghost".
    /// @param proposed The proposed token name to validate
    function _assertBrandName(string memory proposed) internal {
        if (keccak256(bytes(proposed)) != _GHOST_NAME_HASH) {
            revert BrandingInvariant_InvalidName(proposed, GHOST_NAME);
        }
        emit BrandingInvariantEnforced(msg.sender, "name");
    }

    /// @notice Asserts that a proposed token symbol matches the canonical "GST".
    /// @param proposed The proposed token symbol to validate
    function _assertBrandSymbol(string memory proposed) internal {
        if (keccak256(bytes(proposed)) != _GHOST_SYMBOL_HASH) {
            revert BrandingInvariant_InvalidSymbol(proposed, GHOST_SYMBOL);
        }
        emit BrandingInvariantEnforced(msg.sender, "symbol");
    }

    /// @notice Asserts that proposed decimals matches the canonical 18.
    /// @param proposed The proposed decimals value
    function _assertBrandDecimals(uint8 proposed) internal pure {
        if (proposed != GHOST_DECIMALS) {
            revert BrandingInvariant_InvalidDecimals(proposed, GHOST_DECIMALS);
        }
    }

    /// @notice Asserts all three brand fields simultaneously.
    /// @param name     Proposed name
    /// @param symbol   Proposed symbol
    /// @param decimals Proposed decimals
    function _assertBrandTriple(string memory name, string memory symbol, uint8 decimals) internal {
        _assertBrandName(name);
        _assertBrandSymbol(symbol);
        _assertBrandDecimals(decimals);
    }

    /// @notice Asserts that a string does not contain forbidden legacy ETH branding.
    ///         Performs exact case-insensitive match (lowercase comparison).
    ///         NOTE: For substring matching, use off-chain brand-audit.sh.
    /// @param value    The string field value to check
    /// @param field    Human-readable field name (for error context)
    function _assertNoLegacyBranding(string memory value, string memory field) internal pure {
        bytes32 lowered = keccak256(bytes(_toLower(value)));
        if (
            lowered == _ETH_HASH ||
            lowered == _ETHER_HASH ||
            lowered == _ETHEREUM_HASH
        ) {
            revert BrandingInvariant_LegacyBrandingForbidden(field);
        }
    }

    // ─── Pure view helpers ────────────────────────────────────────────────────

    /// @notice Returns true if name/symbol/decimals all match canonical brand constants.
    function isCanonicalBrand(string memory name, string memory symbol, uint8 decimals) public pure returns (bool) {
        return
            keccak256(bytes(name))   == _GHOST_NAME_HASH &&
            keccak256(bytes(symbol)) == _GHOST_SYMBOL_HASH &&
            decimals                 == GHOST_DECIMALS;
    }

    // ─── Internal utility ─────────────────────────────────────────────────────

    /// @dev ASCII lowercase conversion (a–z range only; sufficient for symbol/name checks)
    function _toLower(string memory s) private pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory lower = new bytes(b.length);
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            lower[i] = (c >= 65 && c <= 90) ? bytes1(c + 32) : b[i];
        }
        return string(lower);
    }
}
