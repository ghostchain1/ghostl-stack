// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (token/GRC721/extensions/IGRC721Metadata.sol)

pragma solidity >=0.6.2;

import {IGRC721} from "../IGRC721.sol";

/**
 * @title GRC-721 Non-Fungible Token Standard, optional metadata extension
 * @dev See https://eips.ghostchain.org/EIPS/eip-721
 */
interface IGRC721Metadata is IGRC721 {
    /**
     * @dev Returns the token collection name.
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns the token collection symbol.
     */
    function symbol() external view returns (string memory);

    /**
     * @dev Returns the Uniform Resource Identifier (URI) for `tokenId` token.
     */
    function tokenURI(uint256 tokenId) external view returns (string memory);
}
