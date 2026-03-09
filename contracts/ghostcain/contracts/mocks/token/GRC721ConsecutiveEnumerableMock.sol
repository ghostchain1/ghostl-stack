// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import {GRC721} from "../../token/GRC721/GRC721.sol";
import {GRC721Consecutive} from "../../token/GRC721/extensions/GRC721Consecutive.sol";
import {GRC721Enumerable} from "../../token/GRC721/extensions/GRC721Enumerable.sol";

contract GRC721ConsecutiveEnumerableMock is GRC721Consecutive, GRC721Enumerable {
    constructor(
        string memory name,
        string memory symbol,
        address[] memory receivers,
        uint96[] memory amounts
    ) GRC721(name, symbol) {
        for (uint256 i = 0; i < receivers.length; ++i) {
            _mintConsecutive(receivers[i], amounts[i]);
        }
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(GRC721, GRC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _ownerOf(uint256 tokenId) internal view virtual override(GRC721, GRC721Consecutive) returns (address) {
        return super._ownerOf(tokenId);
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override(GRC721Consecutive, GRC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 amount) internal virtual override(GRC721, GRC721Enumerable) {
        super._increaseBalance(account, amount);
    }
}
