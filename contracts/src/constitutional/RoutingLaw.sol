// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";

/// @title RoutingLaw
/// @notice On-chain enforcement of GhostChain's non-negotiable routing invariant:
///         L3 → L2 → L1 only. No direct L3 → L1 cross-chain calls permitted.
///
/// @dev Routing Law (non-negotiable):
///      - L3 (chainId=903) may only route to L2 (chainId=901)
///      - L2 (chainId=901) may only route to L1 (chainId=14000101)
///      - External egress is permitted only from L1
///      - Any direct L3→L1 bridge is a constitutional violation
///
///      This contract is intended to be used as a guard in bridge adapters,
///      governance executors, and cross-chain message relayers.
///
///      References: packages/routing-law/index.js (JS mirror), docs/routing-policy.md
abstract contract RoutingLaw is GhostBrand {
    // ─── Errors ───────────────────────────────────────────────────────────────

    /// @notice Emitted when a direct L3→L1 route is attempted (constitutional violation)
    error RoutingLawViolation_L3ToL1Bypass(uint256 sourceChain, uint256 destChain);

    /// @notice Emitted when routing from an unrecognized chain ID
    error RoutingLawViolation_UnknownChain(uint256 chainId);

    /// @notice Emitted when external egress is attempted from a non-L1 chain
    error RoutingLawViolation_ExternalEgressNotFromL1(uint256 sourceChain);

    // ─── Events ───────────────────────────────────────────────────────────────

    event RoutingLawEnforced(uint256 indexed sourceChain, uint256 indexed destChain, address indexed caller);

    // ─── Core guard ───────────────────────────────────────────────────────────

    /// @notice Validates a proposed cross-chain route.
    ///         Reverts with a constitutional violation error if the route is forbidden.
    ///
    /// @param sourceChainId  The originating chain ID
    /// @param destChainId    The destination chain ID
    function _assertRoutingLaw(uint256 sourceChainId, uint256 destChainId) internal {
        // Check known chain IDs
        if (
            sourceChainId != L1_CHAIN_ID &&
            sourceChainId != L2_CHAIN_ID &&
            sourceChainId != L3_CHAIN_ID
        ) {
            revert RoutingLawViolation_UnknownChain(sourceChainId);
        }

        // L3 → L1 direct route: FORBIDDEN
        if (sourceChainId == L3_CHAIN_ID && destChainId == L1_CHAIN_ID) {
            revert RoutingLawViolation_L3ToL1Bypass(sourceChainId, destChainId);
        }

        // L3 → L3 same-chain is fine (local call), but unknown dest with L3 source is suspicious
        if (sourceChainId == L3_CHAIN_ID && destChainId != L2_CHAIN_ID && destChainId != L3_CHAIN_ID) {
            revert RoutingLawViolation_L3ToL1Bypass(sourceChainId, destChainId);
        }

        emit RoutingLawEnforced(sourceChainId, destChainId, msg.sender);
    }

    /// @notice Validates that external egress (to non-GhostChain) originates from L1 only.
    /// @param sourceChainId The chain initiating the external egress
    function _assertExternalEgressFromL1(uint256 sourceChainId) internal pure {
        if (sourceChainId != L1_CHAIN_ID) {
            revert RoutingLawViolation_ExternalEgressNotFromL1(sourceChainId);
        }
    }

    /// @notice Check (non-reverting) whether a route is valid under the routing law.
    /// @param sourceChainId The originating chain
    /// @param destChainId   The destination chain
    /// @return valid True if the route is constitutionally permitted
    function isValidRoute(uint256 sourceChainId, uint256 destChainId) public pure returns (bool valid) {
        // L3 → L1: always forbidden
        if (sourceChainId == L3_CHAIN_ID && destChainId == L1_CHAIN_ID) return false;
        // Unknown source: forbidden
        if (
            sourceChainId != L1_CHAIN_ID &&
            sourceChainId != L2_CHAIN_ID &&
            sourceChainId != L3_CHAIN_ID
        ) return false;
        // L3 → non-L2 (other than L3 self): forbidden
        if (sourceChainId == L3_CHAIN_ID && destChainId != L2_CHAIN_ID && destChainId != L3_CHAIN_ID) return false;
        return true;
    }
}
