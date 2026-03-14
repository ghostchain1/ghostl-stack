// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import {GRC721URIStorage} from "../../token/GRC721/extensions/GRC721URIStorage.sol";

abstract contract GRC721URIStorageMock is GRC721URIStorage {
    string private _baseTokenURI;

    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }

    function setBaseURI(string calldata newBaseTokenURI) public {
        _baseTokenURI = newBaseTokenURI;
    }
}
