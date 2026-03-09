// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {IGRC20, GRC20} from "../../token/GRC20/GRC20.sol";
import {GRC1363} from "../../token/GRC20/extensions/GRC1363.sol";

abstract contract GRC1363ReturnFalseOnGRC20Mock is GRC1363 {
    function transfer(address, uint256) public pure override(IGRC20, GRC20) returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) public pure override(IGRC20, GRC20) returns (bool) {
        return false;
    }

    function approve(address, uint256) public pure override(IGRC20, GRC20) returns (bool) {
        return false;
    }
}

abstract contract GRC1363ReturnFalseMock is GRC1363 {
    function transferAndCall(address, uint256, bytes memory) public pure override returns (bool) {
        return false;
    }

    function transferFromAndCall(address, address, uint256, bytes memory) public pure override returns (bool) {
        return false;
    }

    function approveAndCall(address, uint256, bytes memory) public pure override returns (bool) {
        return false;
    }
}
