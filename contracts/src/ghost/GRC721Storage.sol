// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (ghost/GRC721Storage.sol)
pragma solidity ^0.8.24;

import {GRC721} from "./GRC721.sol";

/**
 * @title  GRC721Storage
 * @notice Extension of GRC721 that stores per-token metadata URIs on-chain.
 *         Drop-in Ghost-branded replacement for ERC721URIStorage.
 *
 * Notes
 * -----
 * - GRC721._burn is `internal` (not virtual) so it cannot be overridden here.
 *   Burned token IDs will retain stale _tokenURIs storage; callers that need
 *   cleanup should delete the URI before burning.
 * - tokenURI() reverts with GRC721Storage__NonExistentToken when the token
 *   has not been minted or has been burned.
 */
abstract contract GRC721Storage is GRC721 {
    // ─── Errors ────────────────────────────────────────────────────────────────

    error GRC721Storage__NonExistentToken(uint256 tokenId);

    // ─── Storage ────────────────────────────────────────────────────────────────

    mapping(uint256 => string) private _tokenURIs;

    // ─── Constructor ────────────────────────────────────────────────────────────

    /// @param name_   Token collection name (e.g. "GhostChain NFT Gift").
    /// @param symbol_ Token ticker (e.g. "GNFTG").
    constructor(string memory name_, string memory symbol_) GRC721(name_, symbol_) {}

    /**
     * @notice Returns the URI stored by `_setTokenURI` for `tokenId`.
     * @dev    Reverts if `tokenId` does not exist (has not been minted or was burned).
     */
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        if (!_exists(tokenId)) revert GRC721Storage__NonExistentToken(tokenId);
        return _tokenURIs[tokenId];
    }

    // ─── Internal helpers ───────────────────────────────────────────────────────

    /**
     * @dev Stores `uri` for `tokenId`.  Does not validate that the token exists —
     *      callers must ensure the token has been minted.
     */
    function _setTokenURI(uint256 tokenId, string memory uri) internal virtual {
        _tokenURIs[tokenId] = uri;
    }
}
