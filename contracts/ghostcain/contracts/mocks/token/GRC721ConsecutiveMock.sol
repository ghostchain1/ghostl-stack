// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import {GRC721} from "../../token/GRC721/GRC721.sol";
import {GRC721Consecutive} from "../../token/GRC721/extensions/GRC721Consecutive.sol";
import {GRC721Pausable} from "../../token/GRC721/extensions/GRC721Pausable.sol";
import {GRC721Votes} from "../../token/GRC721/extensions/GRC721Votes.sol";
import {EIP712} from "../../utils/cryptography/EIP712.sol";

/**
 * @title GRC721ConsecutiveMock
 */
contract GRC721ConsecutiveMock is GRC721Consecutive, GRC721Pausable, GRC721Votes {
    uint96 private immutable _offset;

    constructor(
        string memory name,
        string memory symbol,
        uint96 offset,
        address[] memory delegates,
        address[] memory receivers,
        uint96[] memory amounts
    ) GRC721(name, symbol) EIP712(name, "1") {
        _offset = offset;

        for (uint256 i = 0; i < delegates.length; ++i) {
            _delegate(delegates[i], delegates[i]);
        }

        for (uint256 i = 0; i < receivers.length; ++i) {
            _mintConsecutive(receivers[i], amounts[i]);
        }
    }

    function _firstConsecutiveId() internal view virtual override returns (uint96) {
        return _offset;
    }

    function _ownerOf(uint256 tokenId) internal view virtual override(GRC721, GRC721Consecutive) returns (address) {
        return super._ownerOf(tokenId);
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override(GRC721Consecutive, GRC721Pausable, GRC721Votes) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 amount) internal virtual override(GRC721, GRC721Votes) {
        super._increaseBalance(account, amount);
    }
}

contract GRC721ConsecutiveNoConstructorMintMock is GRC721Consecutive {
    constructor(string memory name, string memory symbol) GRC721(name, symbol) {
        _mint(msg.sender, 0);
    }
}
