// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (token/GRC721/extensions/GRC721Burnable.sol)

pragma solidity ^0.8.24;

import {GRC721} from "../GRC721.sol";
import {Context} from "../../../utils/Context.sol";

/**
 * @title GRC-721 Burnable Token
 * @dev GRC-721 Token that can be burned (destroyed).
 */
abstract contract GRC721Burnable is Context, GRC721 {
    /**
     * @dev Burns `tokenId`. See {GRC721-_burn}.
     *
     * Requirements:
     *
     * - The caller must own `tokenId` or be an approved operator.
     */
    function burn(uint256 tokenId) public virtual {
        // Setting an "auth" arguments enables the `_isAuthorized` check which verifies that the token exists
        // (from != 0). Therefore, it is not needed to verify that the return value is not 0 here.
        _update(address(0), tokenId, _msgSender());
    }
}
