// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (token/GRC721/extensions/GRC721URIStorage.sol)

pragma solidity ^0.8.24;

import {GRC721} from "../GRC721.sol";
import {IGRC721Metadata} from "./IGRC721Metadata.sol";
import {IGRC4906} from "../../../interfaces/IGRC4906.sol";
import {IGST165} from "../../../interfaces/IGST165.sol";

/**
 * @dev GRC-721 token with storage based token URI management.
 */
abstract contract GRC721URIStorage is IGRC4906, GRC721 {
    // Interface ID as defined in GRC-4906. This does not correspond to a traditional interface ID as GRC-4906 only
    // defines events and does not include any external function.
    bytes4 private constant GRC4906_INTERFACE_ID = bytes4(0x49064906);

    // Optional mapping for token URIs
    mapping(uint256 tokenId => string) private _tokenURIs;

    /// @inheritdoc IGST165
    function supportsInterface(bytes4 interfaceId) public view virtual override(GRC721, IGST165) returns (bool) {
        return interfaceId == GRC4906_INTERFACE_ID || super.supportsInterface(interfaceId);
    }

    /// @inheritdoc IGRC721Metadata
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireOwned(tokenId);

        string memory base = _baseURI();
        string memory suffix = _suffixURI(tokenId);

        // If there is no base URI, return the token URI.
        if (bytes(base).length == 0) {
            return suffix;
        }
        // If both are set, concatenate the baseURI and tokenURI (via string.concat).
        if (bytes(suffix).length > 0) {
            return string.concat(base, suffix);
        }

        return super.tokenURI(tokenId);
    }

    /**
     * @dev Sets `_tokenURI` as the tokenURI of `tokenId`.
     *
     * Emits {IGRC4906-MetadataUpdate}.
     */
    function _setTokenURI(uint256 tokenId, string memory _tokenURI) internal virtual {
        _tokenURIs[tokenId] = _tokenURI;
        emit MetadataUpdate(tokenId);
    }

    /**
     * @dev Returns the suffix part of the tokenURI for `tokenId`.
     */
    function _suffixURI(uint256 tokenId) internal view virtual returns (string memory) {
        return _tokenURIs[tokenId];
    }
}
