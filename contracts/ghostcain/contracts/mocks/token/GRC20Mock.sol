// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GRC20} from "../../token/GRC20/GRC20.sol";

contract GRC20Mock is GRC20 {
    constructor() GRC20("GRC20Mock", "E20M") {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external {
        _burn(account, amount);
    }
}
