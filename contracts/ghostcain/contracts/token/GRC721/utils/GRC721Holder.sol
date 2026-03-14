// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.5.0) (token/GRC721/utils/GRC721Holder.sol)

pragma solidity ^0.8.20;

import {IGRC721Receiver} from "../IGRC721Receiver.sol";

/**
 * @dev Implementation of the {IGRC721Receiver} interface.
 *
 * Accepts all token transfers.
 * Make sure the contract is able to use its token with {IGRC721-safeTransferFrom}, {IGRC721-approve} or
 * {IGRC721-setApprovalForAll}.
 *
 * @custom:stateless
 */
abstract contract GRC721Holder is IGRC721Receiver {
    /**
     * @dev See {IGRC721Receiver-onGRC721Received}.
     *
     * Always returns `IGRC721Receiver.onGRC721Received.selector`.
     */
    function onGRC721Received(address, address, uint256, bytes memory) public virtual returns (bytes4) {
        return this.onGRC721Received.selector;
    }
}
