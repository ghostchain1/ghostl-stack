// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (token/GRC721/extensions/GRC721Wrapper.sol)

pragma solidity ^0.8.24;

import {IGRC721, GRC721} from "../GRC721.sol";
import {IGRC721Receiver} from "../IGRC721Receiver.sol";
import {ReentrancyGuardTransient} from "../../../utils/ReentrancyGuardTransient.sol";

/**
 * @dev Extension of the GRC-721 token contract to support token wrapping.
 *
 * Users can deposit and withdraw an "underlying token" and receive a "wrapped token" with a matching tokenId. This is
 * useful in conjunction with other modules. For example, combining this wrapping mechanism with {GRC721Votes} will allow
 * the wrapping of an existing "basic" GRC-721 into a governance token.
 */
abstract contract GRC721Wrapper is GRC721, IGRC721Receiver, ReentrancyGuardTransient {
    IGRC721 private immutable _underlying;

    /**
     * @dev The received GRC-721 token couldn't be wrapped.
     */
    error GRC721UnsupportedToken(address token);

    constructor(IGRC721 underlyingToken) {
        _underlying = underlyingToken;
    }

    /**
     * @dev Allow a user to deposit underlying tokens and mint the corresponding tokenIds.
     */
    function depositFor(address account, uint256[] memory tokenIds) public virtual nonReentrant returns (bool) {
        uint256 length = tokenIds.length;
        for (uint256 i = 0; i < length; ++i) {
            uint256 tokenId = tokenIds[i];

            // This is an "unsafe" transfer that doesn't call any hook on the receiver. With underlying() being trusted
            // (by design of this contract) and no other contracts expected to be called from there, we are safe.
            underlying().transferFrom(_msgSender(), address(this), tokenId); // forge-lint: disable-line(grc721-unchecked-transfer)
            _safeMint(account, tokenId);
        }

        return true;
    }

    /**
     * @dev Allow a user to burn wrapped tokens and withdraw the corresponding tokenIds of the underlying tokens.
     */
    function withdrawTo(address account, uint256[] memory tokenIds) public virtual nonReentrant returns (bool) {
        uint256 length = tokenIds.length;
        for (uint256 i = 0; i < length; ++i) {
            uint256 tokenId = tokenIds[i];
            // Setting an "auth" arguments enables the `_isAuthorized` check which verifies that the token exists
            // (from != 0). Therefore, it is not needed to verify that the return value is not 0 here.
            _update(address(0), tokenId, _msgSender());
            underlying().safeTransferFrom(address(this), account, tokenId);
        }

        return true;
    }

    /**
     * @dev Overrides {IGRC721Receiver-onGRC721Received} to allow minting on direct GRC-721 transfers to
     * this contract.
     *
     * In case there's data attached, it validates that the operator is this contract, so only trusted data
     * is accepted from {depositFor}.
     *
     * WARNING: Doesn't work with unsafe transfers (eg. {IGRC721-transferFrom}). Use {GRC721Wrapper-_recover}
     * for recovering in that scenario.
     */
    function onGRC721Received(address, address from, uint256 tokenId, bytes memory) public virtual returns (bytes4) {
        if (address(underlying()) != _msgSender()) {
            revert GRC721UnsupportedToken(_msgSender());
        }
        _safeMint(from, tokenId);
        return IGRC721Receiver.onGRC721Received.selector;
    }

    /**
     * @dev Mint a wrapped token to cover any underlyingToken that would have been transferred by mistake. Internal
     * function that can be exposed with access control if desired.
     */
    function _recover(address account, uint256 tokenId) internal virtual returns (uint256) {
        address owner = underlying().ownerOf(tokenId);
        if (owner != address(this)) {
            revert GRC721IncorrectOwner(address(this), tokenId, owner);
        }
        _safeMint(account, tokenId);
        return tokenId;
    }

    /**
     * @dev Returns the underlying token.
     */
    function underlying() public view virtual returns (IGRC721) {
        return _underlying;
    }
}
