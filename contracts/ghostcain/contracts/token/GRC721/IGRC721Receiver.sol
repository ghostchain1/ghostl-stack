// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (token/GRC721/IGRC721Receiver.sol)

pragma solidity >=0.5.0;

/**
 * @title GRC-721 token receiver interface
 * @dev Interface for any contract that wants to support safeTransfers
 * from GRC-721 asset contracts.
 */
interface IGRC721Receiver {
    /**
     * @dev Whenever an {IGRC721} `tokenId` token is transferred to this contract via {IGRC721-safeTransferFrom}
     * by `operator` from `from`, this function is called.
     *
     * It must return its Solidity selector to confirm the token transfer.
     * If any other value is returned or the interface is not implemented by the recipient, the transfer will be
     * reverted.
     *
     * The selector can be obtained in Solidity with `IGRC721Receiver.onGRC721Received.selector`.
     */
    function onGRC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}
