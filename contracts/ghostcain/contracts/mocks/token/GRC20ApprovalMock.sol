// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GRC20} from "../../token/GRC20/GRC20.sol";

abstract contract GRC20ApprovalMock is GRC20 {
    function _approve(address owner, address spender, uint256 amount, bool) internal virtual override {
        super._approve(owner, spender, amount, true);
    }
}
