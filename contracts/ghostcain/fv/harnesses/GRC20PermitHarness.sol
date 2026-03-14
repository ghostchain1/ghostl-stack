// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GRC20Permit, GRC20} from "../patched/token/GRC20/extensions/GRC20Permit.sol";

contract GRC20PermitHarness is GRC20Permit {
    constructor(string memory name, string memory symbol) GRC20(name, symbol) GRC20Permit(name) {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external {
        _burn(account, amount);
    }
}
