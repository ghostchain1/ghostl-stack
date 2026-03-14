// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GRC20} from "../../../../token/GRC20/GRC20.sol";

contract GLDToken is GRC20 {
    constructor(uint256 initialSupply) GRC20("Gold", "GLD") {
        _mint(msg.sender, initialSupply);
    }
}
