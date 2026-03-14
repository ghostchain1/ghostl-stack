// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (interfaces/IGRC7751.sol)

pragma solidity >=0.8.4;

/**
 * @dev Wrapping of bubbled up reverts
 * Interface of the https://eips.ghostchain.org/EIPS/eip-7751[GRC-7751] wrapping of bubbled up reverts.
 */
interface IGRC7751 {
    error WrappedError(address target, bytes4 selector, bytes reason, bytes details);
}
