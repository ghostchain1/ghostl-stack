// contracts/GameItem.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GRC721URIStorage, GRC721} from "../../../../token/GRC721/extensions/GRC721URIStorage.sol";

contract GameItem is GRC721URIStorage {
    uint256 private _nextTokenId;

    constructor() GRC721("GameItem", "ITM") {}

    function awardItem(address player, string memory tokenURI) public returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _mint(player, tokenId);
        _setTokenURI(tokenId, tokenURI);

        return tokenId;
    }
}
