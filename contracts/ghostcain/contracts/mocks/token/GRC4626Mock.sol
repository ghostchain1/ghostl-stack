// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IGRC20, GRC20} from "../../token/GRC20/GRC20.sol";
import {GRC4626} from "../../token/GRC20/extensions/GRC4626.sol";

contract GRC4626Mock is GRC4626 {
    constructor(address underlying) GRC20("GRC4626Mock", "E4626M") GRC4626(IGRC20(underlying)) {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external {
        _burn(account, amount);
    }
}
