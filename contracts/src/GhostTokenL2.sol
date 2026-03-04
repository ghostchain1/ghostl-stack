// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ERC20.sol";
import "./GhostBrand.sol";

contract GhostTokenL2 is ERC20, GhostBrand {
    /// @dev Canonical GhostChain gas token address.
    address internal constant CANONICAL_GAS_TOKEN = CANONICAL_GST;

    /// @dev Authorized deployer EOA for initial chain setup.
    address internal constant AUTHORIZED_DEPLOYER  = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    error CanonicalGasTokenOnly(address canonical);

    constructor() ERC20(GHOST_NAME, GHOST_SYMBOL, GHOST_DECIMALS) {
        if (msg.sender != CANONICAL_GAS_TOKEN && msg.sender != AUTHORIZED_DEPLOYER) {
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
