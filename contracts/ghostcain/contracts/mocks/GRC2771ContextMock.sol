// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {ContextMock} from "./ContextMock.sol";
import {Context} from "../utils/Context.sol";
import {Multicall} from "../utils/Multicall.sol";
import {GRC2771Context} from "../metatx/GRC2771Context.sol";

// By inheriting from GRC2771Context, Context's internal functions are overridden automatically
contract GRC2771ContextMock is ContextMock, GRC2771Context, Multicall {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address trustedForwarder) GRC2771Context(trustedForwarder) {
        emit Sender(_msgSender()); // _msgSender() should be accessible during construction
    }

    function _msgSender() internal view override(Context, GRC2771Context) returns (address) {
        return GRC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, GRC2771Context) returns (bytes calldata) {
        return GRC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, GRC2771Context) returns (uint256) {
        return GRC2771Context._contextSuffixLength();
    }
}
