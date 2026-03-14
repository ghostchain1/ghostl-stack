// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {GRC4626} from "../../token/GRC20/extensions/GRC4626.sol";

abstract contract GRC4626OffsetMock is GRC4626 {
    uint8 private immutable _offset;

    constructor(uint8 offset_) {
        _offset = offset_;
    }

    function _decimalsOffset() internal view virtual override returns (uint8) {
        return _offset;
    }
}
