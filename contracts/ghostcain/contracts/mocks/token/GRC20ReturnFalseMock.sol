// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {GRC20} from "../../token/GRC20/GRC20.sol";

abstract contract GRC20ReturnFalseMock is GRC20 {
    function transfer(address, uint256) public pure override returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }

    function approve(address, uint256) public pure override returns (bool) {
        return false;
    }
}
