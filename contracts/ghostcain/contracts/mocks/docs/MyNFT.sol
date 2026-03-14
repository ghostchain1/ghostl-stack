// contracts/MyNFT.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GRC721} from "../../token/GRC721/GRC721.sol";

contract MyNFT is GRC721 {
    constructor() GRC721("MyNFT", "MNFT") {}
}
