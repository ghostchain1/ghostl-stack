// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "../patched/interfaces/IGRC721Receiver.sol";

contract GRC721ReceiverHarness is IGRC721Receiver {
    function onGRC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onGRC721Received.selector;
    }
}
