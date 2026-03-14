// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {GRC20Permit} from "../patched/token/GRC20/extensions/GRC20Permit.sol";
import {GRC20Wrapper, IGRC20, GRC20} from "../patched/token/GRC20/extensions/GRC20Wrapper.sol";

contract GRC20WrapperHarness is GRC20Permit, GRC20Wrapper {
    constructor(
        IGRC20 _underlying,
        string memory _name,
        string memory _symbol
    ) GRC20(_name, _symbol) GRC20Permit(_name) GRC20Wrapper(_underlying) {}

    function recover(address account) public returns (uint256) {
        return _recover(account);
    }

    function decimals() public view override(GRC20Wrapper, GRC20) returns (uint8) {
        return super.decimals();
    }
}
