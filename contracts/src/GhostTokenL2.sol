// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ERC20.sol";

contract GhostTokenL2 is ERC20 {
    constructor() ERC20("Ghost Token (L2)", "GHOST", 18) {
        _mint(msg.sender, 1_000_000 ether);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function burnFrom(address from, uint256 amount) external {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _burn(from, amount);
    }
}
