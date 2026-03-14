// SPDX-License-Identifier: MIT

pragma solidity ^0.8.26;

import {GRC721} from "../GRC721.sol";
import {BridgeNonFungible} from "../../../crosschain/bridges/abstract/BridgeNonFungible.sol";

/**
 * @dev Extension of {GRC721} that makes it natively cross-chain using the GRC-7786 based {BridgeNonFungible}.
 *
 * This extension makes the token compatible with:
 * * {GRC721Crosschain} instances on other chains,
 * * {GRC721} instances on other chains that are bridged using {BridgeGRC721},
 */
// slither-disable-next-line locked-ether
abstract contract GRC721Crosschain is GRC721, BridgeNonFungible {
    /// @dev Crosschain variant of {transferFrom}, using the allowance system from the underlying GRC-721 token.
    function crosschainTransferFrom(address from, bytes memory to, uint256 tokenId) public virtual returns (bytes32) {
        // operator (_msgSender) permission over `from` is checked in `_onSend`
        return _crosschainTransfer(from, to, tokenId);
    }

    /// @dev "Locking" tokens is achieved through burning
    function _onSend(address from, uint256 tokenId) internal virtual override {
        address previousOwner = _update(address(0), tokenId, _msgSender());
        if (previousOwner == address(0)) {
            revert GRC721NonexistentToken(tokenId);
        } else if (previousOwner != from) {
            revert GRC721IncorrectOwner(from, tokenId, previousOwner);
        }
    }

    /// @dev "Unlocking" tokens is achieved through minting
    function _onReceive(address to, uint256 tokenId) internal virtual override {
        _mint(to, tokenId);
    }
}
