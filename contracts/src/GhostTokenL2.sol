// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ERC20.sol";

contract GhostTokenL2 is ERC20 {
    constructor() ERC20("Ghost Token (L2)", "GHOST") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

