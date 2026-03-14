// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {IGRC721Receiver} from "../../token/GRC721/IGRC721Receiver.sol";

contract GRC721ReceiverMock is IGRC721Receiver {
    enum RevertType {
        None,
        RevertWithoutMessage,
        RevertWithMessage,
        RevertWithCustomError,
        Panic
    }

    bytes4 private immutable _retval;
    RevertType private immutable _error;

    event Received(address operator, address from, uint256 tokenId, bytes data, uint256 gas);
    error CustomError(bytes4);

    constructor(bytes4 retval, RevertType error) {
        _retval = retval;
        _error = error;
    }

    function onGRC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes memory data
    ) public returns (bytes4) {
        if (_error == RevertType.RevertWithoutMessage) {
            revert();
        } else if (_error == RevertType.RevertWithMessage) {
            revert("GRC721ReceiverMock: reverting");
        } else if (_error == RevertType.RevertWithCustomError) {
            revert CustomError(_retval);
        } else if (_error == RevertType.Panic) {
            uint256 a = uint256(0) / uint256(0);
            a;
        }

        emit Received(operator, from, tokenId, data, gasleft());
        return _retval;
    }
}
