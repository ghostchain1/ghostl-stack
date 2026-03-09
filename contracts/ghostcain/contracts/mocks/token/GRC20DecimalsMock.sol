// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {GRC20} from "../../token/GRC20/GRC20.sol";

abstract contract GRC20DecimalsMock is GRC20 {
    uint8 private immutable _decimals;

    constructor(uint8 decimals_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
