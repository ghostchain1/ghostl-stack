// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (utils/introspection/IGST165.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the GST-165 standard, as defined in the
 * https://eips.ghostchain.org/EIPS/eip-165[GRC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({GST165Checker}).
 *
 * For an implementation, see {GST165}.
 */
interface IGST165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ghostchain.org/EIPS/eip-165#how-interfaces-are-identified[GRC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
