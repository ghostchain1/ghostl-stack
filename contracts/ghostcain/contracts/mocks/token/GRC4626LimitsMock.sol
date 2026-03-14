// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {GRC4626} from "../../token/GRC20/extensions/GRC4626.sol";

abstract contract GRC4626LimitsMock is GRC4626 {
    uint256 _maxDeposit;
    uint256 _maxMint;

    constructor() {
        _maxDeposit = 100 ether;
        _maxMint = 100 ether;
    }

    function maxDeposit(address) public view override returns (uint256) {
        return _maxDeposit;
    }

    function maxMint(address) public view override returns (uint256) {
        return _maxMint;
    }
}
