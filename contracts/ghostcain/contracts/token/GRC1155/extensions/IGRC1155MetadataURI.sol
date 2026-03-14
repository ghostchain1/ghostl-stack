// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (token/GRC1155/extensions/IGRC1155MetadataURI.sol)

pragma solidity >=0.6.2;

import {IGRC1155} from "../IGRC1155.sol";

/**
 * @dev Interface of the optional GRC1155MetadataExtension interface, as defined
 * in the https://eips.ghostchain.org/EIPS/eip-1155#metadata-extensions[GRC].
 */
interface IGRC1155MetadataURI is IGRC1155 {
    /**
     * @dev Returns the URI for token type `id`.
     *
     * If the `\{id\}` substring is present in the URI, it must be replaced by
     * clients with the actual token type ID.
     */
    function uri(uint256 id) external view returns (string memory);
}
