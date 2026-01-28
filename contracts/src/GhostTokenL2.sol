// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ERC20.sol";

contract GhostTokenL2 is ERC20 {
    /// @dev Canonical GhostChain gas token (L1) used across all layers.
    address internal constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    error CanonicalGasTokenOnly(address canonical);

    constructor() ERC20("Ghost Token", "GHOST", 18) {
        if (msg.sender != CANONICAL_GAS_TOKEN) {
            revert CanonicalGasTokenOnly(CANONICAL_GAS_TOKEN);
        }
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
